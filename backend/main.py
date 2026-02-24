from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pathlib import Path
import uuid
import json
from datetime import datetime
import asyncio
from typing import Optional

from models import AnalyzeTranscriptRequest, AnalyzeFromS3Request, AnalyzeResponse, OSCEReport
from bedrock import analyze_transcript_with_bedrock
from pdf_generator import generate_pdf_report
from s3_client import (
    list_input_transcripts,
    get_transcript_from_s3,
    save_report_to_s3,
    get_report_from_s3,
    list_reports_from_s3,
    delete_file_from_s3,
    S3_INPUT_BUCKET,
    S3_OUTPUT_BUCKET
)
from transcribe import transcribe_audio_file, get_s3_client

app = FastAPI(title="AuSTRICH-AI API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite defaults
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure reports directory exists
REPORTS_DIR = Path("reports")
REPORTS_DIR.mkdir(exist_ok=True)


@app.get("/")
async def root():
    return {"message": "AuSTRICH-AI API", "status": "running"}


@app.get("/s3/input-files")
async def list_s3_input_files():
    """List all transcript files from S3 input bucket"""
    try:
        files = list_input_transcripts()
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/osce/analyze-from-s3")
async def analyze_from_s3_endpoint(request: AnalyzeFromS3Request):
    """Analyze transcript from S3 input bucket with parallel batch processing"""
    async def generate():
        try:
            transcript = get_transcript_from_s3(request.file_key)
            batch_count = max(1, min(request.batch_count or 1, 10))
            
            yield f"data: {{\"status\": \"processing\", \"message\": \"Generating {batch_count} report(s) in parallel...\"}}\n\n"
            
            # Create all tasks and run in parallel
            report_ids_list = [str(uuid.uuid4()) for _ in range(batch_count)]
            tasks = [analyze_transcript_with_bedrock(transcript, request.model_id) for _ in range(batch_count)]
            
            # Execute all in parallel
            results = await asyncio.gather(*tasks)
            
            # Save all reports
            report_ids = []
            for report_id, report_text in zip(report_ids_list, results):
                file_key = save_report_to_s3(report_id, transcript, report_text, source_file=request.file_key, model_id=request.model_id)
                report_ids.append(file_key.replace('.json', ''))
            
            message = f"Generated {batch_count} report(s)" if batch_count > 1 else "Analysis completed"
            yield f"data: {{\"status\": \"complete\", \"report_id\": \"{report_ids[0]}\", \"message\": \"{message}\"}}\n\n"
        
        except Exception as e:
            yield f"data: {{\"status\": \"error\", \"message\": \"{str(e)}\"}}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")


@app.delete("/s3/input-files/{file_key:path}")
async def delete_input_file(file_key: str):
    """Delete a file from S3 input bucket"""
    try:
        delete_file_from_s3(S3_INPUT_BUCKET, file_key)
        return {"success": True, "message": "File deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/s3/output-files/{file_key:path}")
async def delete_output_file(file_key: str):
    """Delete a file from S3 output bucket"""
    try:
        delete_file_from_s3(S3_OUTPUT_BUCKET, file_key)
        return {"success": True, "message": "File deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/osce/analyze-transcript")
async def analyze_transcript_endpoint(
    file: Optional[UploadFile] = File(None),
    transcript: Optional[str] = Form(None),
    model_id: Optional[str] = Form(None)
):
    """Analyze OSCE transcript using AWS Bedrock - accepts TEXT file upload or text"""
    # Read file content before generator if file exists
    transcript_text = None
    source_filename = None
    
    if file:
        source_filename = file.filename
        content = await file.read()
        try:
            transcript_text = content.decode('utf-8')
        except UnicodeDecodeError:
            return StreamingResponse(
                iter([f"data: {{\"status\": \"error\", \"message\": \"Invalid file format\"}}\n\n"]),
                media_type="text/event-stream"
            )
    elif transcript:
        transcript_text = transcript
    
    if not transcript_text:
        return StreamingResponse(
            iter([f"data: {{\"status\": \"error\", \"message\": \"No transcript provided\"}}\n\n"]),
            media_type="text/event-stream"
        )
    
    async def generate():
        try:
            yield f"data: {{\"status\": \"analyzing\", \"message\": \"Analyzing transcript with AI...\"}}\n\n"
            
            report_id = str(uuid.uuid4())
            report_text = await analyze_transcript_with_bedrock(transcript_text, model_id)
            
            yield f"data: {{\"status\": \"processing\", \"message\": \"Processing results...\"}}\n\n"
            
            # Parse JSON response
            try:
                cleaned_text = report_text.strip()
                
                if '```json' in cleaned_text:
                    cleaned_text = cleaned_text.split('```json', 1)[1].split('```', 1)[0]
                elif '```' in cleaned_text:
                    cleaned_text = cleaned_text.split('```', 1)[1].rsplit('```', 1)[0]
                
                start = cleaned_text.find('{')
                end = cleaned_text.rfind('}') + 1
                if start != -1 and end > start:
                    cleaned_text = cleaned_text[start:end]
                
                report_data = json.loads(cleaned_text)
                
                # Clean timestamps
                for item in report_data.get('checklist', []):
                    if item.get('timestamp'):
                        item['timestamp'] = item['timestamp'].split('.')[0].split(',')[0][:8]
                    if item.get('timestamp_end'):
                        item['timestamp_end'] = item['timestamp_end'].split('.')[0].split(',')[0][:8]
                        
            except json.JSONDecodeError as e:
                yield f"data: {{\"status\": \"error\", \"message\": \"Failed to parse AI response\"}}\n\n"
                return
            
            yield f"data: {{\"status\": \"saving\", \"message\": \"Saving report...\"}}\n\n"
            
            # Save to S3 reports/ folder with source filename
            save_report_to_s3(report_id, transcript_text, json.dumps(report_data), source_file=source_filename, model_id=model_id)
            
            yield f"data: {{\"status\": \"complete\", \"report_id\": \"{report_id}\", \"message\": \"Analysis completed successfully\"}}\n\n"
        
        except Exception as e:
            yield f"data: {{\"status\": \"error\", \"message\": \"{str(e)}\"}}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/reports/{report_id}", response_model=OSCEReport)
async def get_report(report_id: str):
    """Retrieve a specific OSCE report by ID from S3"""
    try:
        report_data = get_report_from_s3(report_id)
        return OSCEReport(**report_data)
    except Exception as e:
        raise HTTPException(status_code=404, detail="Report not found")


@app.get("/reports/{report_id}/pdf")
async def get_report_pdf(report_id: str):
    """Download PDF report - generates on-demand if not exists"""
    try:
        pdf_path = REPORTS_DIR / f"{report_id}.pdf"
        
        # If PDF doesn't exist, generate it
        if not pdf_path.exists():
            # Fetch report from S3
            report_data = get_report_from_s3(report_id)
            
            # Parse the report JSON
            report_json = json.loads(report_data['report'])
            
            # Generate PDF
            generate_pdf_report(
                report_id, 
                report_data['transcript'], 
                report_json, 
                report_data.get('model_id')
            )
        
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"osce_report_{report_id}.pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/osce/upload-audio")
async def upload_audio_only(
    file: UploadFile = File(...)
):
    """Just upload audio file to S3 without transcription"""
    try:
        file_ext = Path(file.filename).suffix.lower()
        
        if file_ext not in ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm']:
            raise HTTPException(status_code=400, detail="Invalid audio format")
        
        s3 = get_s3_client()
        audio_key = f"audio/{uuid.uuid4()}{file_ext}"
        
        content = await file.read()
        print(f"Uploading {len(content)} bytes to s3://{S3_INPUT_BUCKET}/{audio_key}")
        
        s3.put_object(
            Bucket=S3_INPUT_BUCKET,
            Key=audio_key,
            Body=content,
            ContentType=file.content_type or 'audio/webm'
        )
        
        print(f"Audio uploaded successfully to {audio_key}")
        
        return {
            "success": True,
            "audio_key": audio_key,
            "message": "Audio uploaded successfully"
        }
    
    except Exception as e:
        print(f"Error uploading audio: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/osce/upload-and-analyze")
async def upload_and_analyze_audio(
    file: UploadFile = File(...),
    model_id: str = Form(...)
):
    """Upload audio, transcribe, analyze with progress updates"""
    # Read file content BEFORE creating generator
    file_content = await file.read()
    file_ext = Path(file.filename).suffix.lower()
    filename_stem = Path(file.filename).stem
    
    async def generate():
        try:
            # Validate audio file
            if file_ext not in ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm']:
                yield f"data: {{\"status\": \"error\", \"message\": \"Invalid audio format\"}}\n\n"
                return
            
            yield f"data: {{\"status\": \"uploading\", \"message\": \"Uploading audio file...\"}}\n\n"
            
            s3 = get_s3_client()
            audio_key = f"audio/{uuid.uuid4()}{file_ext}"
            
            # Upload audio to S3
            print(f"Uploading {len(file_content)} bytes to s3://{S3_INPUT_BUCKET}/{audio_key}")
            s3.put_object(Bucket=S3_INPUT_BUCKET, Key=audio_key, Body=file_content)
            print(f"Audio uploaded successfully")
            
            yield f"data: {{\"status\": \"transcribing\", \"message\": \"Transcribing audio (this may take a few minutes)...\"}}\n\n"
            
            # Transcribe
            print(f"Starting transcription for {audio_key}")
            transcript = await transcribe_audio_file(audio_key)
            print(f"Transcription completed, length: {len(transcript)} chars")
            
            yield f"data: {{\"status\": \"saving\", \"message\": \"Saving transcript...\"}}\n\n"
            
            # Save transcript with original audio filename
            original_filename = filename_stem if filename_stem else 'recording'
            transcript_key = f"transcripts/{original_filename}.txt"
            print(f"Saving transcript to s3://{S3_INPUT_BUCKET}/{transcript_key}")
            s3.put_object(
                Bucket=S3_INPUT_BUCKET,
                Key=transcript_key,
                Body=transcript.encode('utf-8'),
                ContentType='text/plain'
            )
            print(f"Transcript saved successfully")
            
            # Keep audio file (don't delete)
            # Audio saved at: s3://bucket/audio/filename.webm
            # Transcript saved at: s3://bucket/transcripts/filename.txt
            
            yield f"data: {{\"status\": \"analyzing\", \"message\": \"Analyzing transcript with AI...\"}}\n\n"
            
            # Analyze transcript (single report)
            report_id = str(uuid.uuid4())
            report_text = await analyze_transcript_with_bedrock(transcript, model_id)
            
            # Parse and clean the report
            try:
                cleaned_text = report_text.strip()
                if '```json' in cleaned_text:
                    cleaned_text = cleaned_text.split('```json', 1)[1].split('```', 1)[0]
                elif '```' in cleaned_text:
                    cleaned_text = cleaned_text.split('```', 1)[1].rsplit('```', 1)[0]
                
                start = cleaned_text.find('{')
                end = cleaned_text.rfind('}') + 1
                if start != -1 and end > start:
                    cleaned_text = cleaned_text[start:end]
                
                report_data = json.loads(cleaned_text)
                
                # Clean timestamps
                for item in report_data.get('checklist', []):
                    if item.get('timestamp'):
                        item['timestamp'] = item['timestamp'].split('.')[0].split(',')[0][:8]
                    if item.get('timestamp_end'):
                        item['timestamp_end'] = item['timestamp_end'].split('.')[0].split(',')[0][:8]
            except json.JSONDecodeError as e:
                yield f"data: {{\"status\": \"error\", \"message\": \"Failed to parse AI response\"}}\n\n"
                return
            
            # Save to S3 reports/ folder with original audio filename as source
            save_report_to_s3(report_id, transcript, json.dumps(report_data), source_file=f"{original_filename}{file_ext}", model_id=model_id)
            final_report_id = report_id
            
            yield f"data: {{\"status\": \"complete\", \"report_id\": \"{final_report_id}\", \"transcript_key\": \"{transcript_key}\", \"message\": \"Analysis completed successfully\"}}\n\n"
        
        except Exception as e:
            yield f"data: {{\"status\": \"error\", \"message\": \"{str(e)}\"}}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/reports")
async def list_reports():
    """List all available reports from S3"""
    try:
        reports = list_reports_from_s3()
        return {"reports": reports}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
