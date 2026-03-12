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
from json_repair import repair_json
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
            
            # Generate report ID from filename and timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename_base = Path(source_filename).stem if source_filename else 'transcript'
            report_id = f"{filename_base}_{timestamp}"
            report_text = await analyze_transcript_with_bedrock(transcript_text, model_id)
            
            yield f"data: {{\"status\": \"processing\", \"message\": \"Parsing AI evaluation results...\"}}\n\n"
            
            # Parse JSON response
            try:
                cleaned_text = repair_json(report_text)
                report_data = json.loads(cleaned_text)
                
                # Validate and fix overall_status for items with sub-items
                for item in report_data.get('checklist', []):
                    if item.get('has_subitems') and item.get('subitems'):
                        yes_count = sum(1 for sub in item['subitems'] if sub.get('status') == 'Yes')
                        not_sure_count = sum(1 for sub in item['subitems'] if sub.get('status') == 'Not Sure')
                        
                        # Item 2: at least 3 of 5
                        if item['item'].startswith('2.'):
                            if yes_count >= 3:
                                item['overall_status'] = 'Yes'
                            elif yes_count + not_sure_count >= 3:
                                item['overall_status'] = 'Not Sure'
                            else:
                                item['overall_status'] = 'No'
                        
                        # Item 4: ALL 4 required
                        elif item['item'].startswith('4.'):
                            if yes_count == 4:
                                item['overall_status'] = 'Yes'
                            elif yes_count + not_sure_count == 4:
                                item['overall_status'] = 'Not Sure'
                            else:
                                item['overall_status'] = 'No'
                        
                        # Item 5: at least 4 of 5
                        elif item['item'].startswith('5.'):
                            if yes_count >= 4:
                                item['overall_status'] = 'Yes'
                            elif yes_count + not_sure_count >= 4:
                                item['overall_status'] = 'Not Sure'
                            else:
                                item['overall_status'] = 'No'
                
                # Clean timestamps in checklist items
                for item in report_data.get('checklist', []):
                    if item.get('timestamp'):
                        item['timestamp'] = item['timestamp'].split('.')[0].split(',')[0][:8]
                    if item.get('timestamp_end'):
                        item['timestamp_end'] = item['timestamp_end'].split('.')[0].split(',')[0][:8]
                    # Clean timestamps in sub-items if they exist
                    if item.get('has_subitems') and item.get('subitems'):
                        for subitem in item['subitems']:
                            if subitem.get('timestamp'):
                                subitem['timestamp'] = subitem['timestamp'].split('.')[0].split(',')[0][:8]
                            if subitem.get('timestamp_end'):
                                subitem['timestamp_end'] = subitem['timestamp_end'].split('.')[0].split(',')[0][:8]
                        
            except json.JSONDecodeError as e:
                error_msg = str(e).replace('"', '\\"').replace('\n', ' ')
                print(f"JSON Parse Error: {str(e)}")
                print(f"Raw response (first 500 chars): {report_text[:500]}")
                print(f"Cleaned text (first 500 chars): {cleaned_text[:500]}")
                yield f"data: {{\"status\": \"error\", \"message\": \"AI returned invalid JSON: {error_msg}\"}}\n\n"
                return
            
            yield f"data: {{\"status\": \"saving\", \"message\": \"Saving report...\"}}\n\n"
            
            # Save to S3 reports/ folder with source filename
            save_report_to_s3(report_id, transcript_text, json.dumps(report_data), source_file=source_filename, model_id=model_id)
            
            yield f"data: {{\"status\": \"complete\", \"report_id\": \"{report_id}\", \"message\": \"Analysis completed successfully\"}}\n\n"
        
        except Exception as e:
            error_msg = str(e).replace('"', '\\"').replace('\n', ' ')
            yield f"data: {{\"status\": \"error\", \"message\": \"{error_msg}\"}}\n\n"
    
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
    """Generate and download PDF report on-demand (not cached)"""
    try:
        # Fetch report from S3
        report_data = get_report_from_s3(report_id)
        
        # Parse the report JSON
        report_json = json.loads(report_data['report'])
        
        # Generate PDF to temp location
        import tempfile
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.pdf', delete=False) as tmp:
            from pdf_generator import generate_pdf_report
            pdf_path = generate_pdf_report(
                report_id, 
                report_data['transcript'], 
                report_json, 
                report_data.get('model_id')
            )
            # Read the generated PDF
            with open(pdf_path, 'rb') as f:
                pdf_content = f.read()
            # Delete the local file immediately
            Path(pdf_path).unlink()
            
        return StreamingResponse(
            iter([pdf_content]),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=osce_report_{report_id}.pdf"}
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
            
            yield f"data: {{\"status\": \"uploading\", \"message\": \"Step 1/4: Uploading audio file to S3...\"}}\n\n"
            
            s3 = get_s3_client()
            audio_key = f"audio/{uuid.uuid4()}{file_ext}"
            
            # Upload audio to S3
            print(f"Uploading {len(file_content)} bytes to s3://{S3_INPUT_BUCKET}/{audio_key}")
            s3.put_object(Bucket=S3_INPUT_BUCKET, Key=audio_key, Body=file_content)
            print(f"Audio uploaded successfully")
            
            yield f"data: {{\"status\": \"transcribing\", \"message\": \"Step 2/4: Transcribing audio with AWS Transcribe (2-3 minutes)...\"}}\n\n"
            
            # Transcribe
            print(f"Starting transcription for {audio_key}")
            transcript = await transcribe_audio_file(audio_key)
            print(f"Transcription completed, length: {len(transcript)} chars")
            
            yield f"data: {{\"status\": \"saving\", \"message\": \"Step 3/4: Saving transcript to S3...\"}}\n\n"
            
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
            
            # Generate report ID from filename and timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            report_id = f"{original_filename}_{timestamp}"
            report_text = await analyze_transcript_with_bedrock(transcript, model_id)
            
            # Parse and clean the report
            try:
                cleaned_text = repair_json(report_text)
                report_data = json.loads(cleaned_text)
                
                # Clean timestamps in checklist items
                for item in report_data.get('checklist', []):
                    if item.get('timestamp'):
                        item['timestamp'] = item['timestamp'].split('.')[0].split(',')[0][:8]
                    if item.get('timestamp_end'):
                        item['timestamp_end'] = item['timestamp_end'].split('.')[0].split(',')[0][:8]
                    # Clean timestamps in sub-items if they exist
                    if item.get('has_subitems') and item.get('subitems'):
                        for subitem in item['subitems']:
                            if subitem.get('timestamp'):
                                subitem['timestamp'] = subitem['timestamp'].split('.')[0].split(',')[0][:8]
                            if subitem.get('timestamp_end'):
                                subitem['timestamp_end'] = subitem['timestamp_end'].split('.')[0].split(',')[0][:8]
            except json.JSONDecodeError as e:
                error_msg = str(e).replace('"', '\\"').replace('\n', ' ')
                print(f"JSON Parse Error: {str(e)}")
                print(f"Raw response (first 500 chars): {report_text[:500]}")
                print(f"Cleaned text (first 500 chars): {cleaned_text[:500]}")
                yield f"data: {{\"status\": \"error\", \"message\": \"AI returned invalid JSON: {error_msg}\"}}\n\n"
                return
            
            # Save to S3 reports/ folder with original audio filename as source
            save_report_to_s3(report_id, transcript, json.dumps(report_data), source_file=f"{original_filename}{file_ext}", model_id=model_id)
            final_report_id = report_id
            
            yield f"data: {{\"status\": \"complete\", \"report_id\": \"{final_report_id}\", \"transcript_key\": \"{transcript_key}\", \"message\": \"Analysis completed successfully\"}}\n\n"
        
        except Exception as e:
            error_msg = str(e).replace('"', '\\"').replace('\n', ' ')
            yield f"data: {{\"status\": \"error\", \"message\": \"{error_msg}\"}}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/benchmark/transcribe")
async def benchmark_transcribe(
    file: UploadFile = File(...)
):
    """Transcribe audio and track timing for benchmarking"""
    file_content = await file.read()
    file_ext = Path(file.filename).suffix.lower()
    filename_stem = Path(file.filename).stem
    
    async def generate():
        try:
            if file_ext not in ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm']:
                yield f"data: {{\"status\": \"error\", \"message\": \"Invalid audio format\"}}\n\n"
                return
            
            yield f"data: {{\"status\": \"uploading\", \"message\": \"Uploading audio to S3...\"}}\n\n"
            
            s3 = get_s3_client()
            audio_key = f"audio/{uuid.uuid4()}{file_ext}"
            s3.put_object(Bucket=S3_INPUT_BUCKET, Key=audio_key, Body=file_content)
            
            yield f"data: {{\"status\": \"transcribing\", \"message\": \"Transcribing audio...\"}}\n\n"
            
            import time
            transcription_start = time.time()
            transcript = await transcribe_audio_file(audio_key)
            transcription_time = time.time() - transcription_start
            
            # Save transcript
            transcript_key = f"transcripts/{filename_stem}.txt"
            s3.put_object(
                Bucket=S3_INPUT_BUCKET,
                Key=transcript_key,
                Body=transcript.encode('utf-8'),
                ContentType='text/plain'
            )
            
            yield f"data: {{\"status\": \"complete\", \"filename\": \"{file.filename}\", \"transcription_time\": {transcription_time:.2f}, \"transcript_key\": \"{transcript_key}\", \"transcript_length\": {len(transcript)}, \"message\": \"Transcription completed\"}}\n\n"
        
        except Exception as e:
            error_msg = str(e).replace('"', '\\"').replace('\n', ' ')
            yield f"data: {{\"status\": \"error\", \"message\": \"{error_msg}\"}}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/benchmark/analyze")
async def benchmark_analyze(
    files: list[UploadFile] = File(...),
    model_ids: list[str] = Form(...)
):
    """Analyze transcript files with multiple models and track timing"""
    # Read all files first before generator starts
    transcripts = []
    for file in files:
        content = await file.read()
        transcripts.append((file.filename, content.decode('utf-8')))
    
    async def generate():
        try:
            # Create all analysis tasks (transcript x model combinations)
            tasks = []
            for filename, transcript in transcripts:
                for model_id in model_ids:
                    tasks.append((filename, model_id, transcript))
            
            total = len(tasks)
            yield f"data: {{\"status\": \"analyzing\", \"message\": \"Running {total} analyses in parallel...\"}}\n\n"
            
            # Run all analyses in parallel
            import time
            async def analyze_one(filename, model_id, transcript):
                start = time.time()
                report_text = await analyze_transcript_with_bedrock(transcript, model_id)
                analysis_time = time.time() - start
                
                # Parse checklist from report
                try:
                    cleaned_text = repair_json(report_text)
                    report_data = json.loads(cleaned_text)
                    
                    # Validate and fix overall_status for items with sub-items
                    for item in report_data.get('checklist', []):
                        if item.get('has_subitems') and item.get('subitems'):
                            yes_count = sum(1 for sub in item['subitems'] if sub.get('status') == 'Yes')
                            not_sure_count = sum(1 for sub in item['subitems'] if sub.get('status') == 'Not Sure')
                            
                            if item['item'].startswith('2.'):
                                if yes_count >= 3:
                                    item['overall_status'] = 'Yes'
                                elif yes_count + not_sure_count >= 3:
                                    item['overall_status'] = 'Not Sure'
                                else:
                                    item['overall_status'] = 'No'
                            elif item['item'].startswith('4.'):
                                if yes_count == 4:
                                    item['overall_status'] = 'Yes'
                                elif yes_count + not_sure_count == 4:
                                    item['overall_status'] = 'Not Sure'
                                else:
                                    item['overall_status'] = 'No'
                            elif item['item'].startswith('5.'):
                                if yes_count >= 4:
                                    item['overall_status'] = 'Yes'
                                elif yes_count + not_sure_count >= 4:
                                    item['overall_status'] = 'Not Sure'
                                else:
                                    item['overall_status'] = 'No'
                    
                    checklist = report_data.get('checklist', [])
                except:
                    checklist = []
                
                return {
                    'transcript_key': filename,
                    'model_id': model_id,
                    'analysis_time': analysis_time,
                    'checklist': checklist
                }
            
            results = await asyncio.gather(*[analyze_one(fn, mid, t) for fn, mid, t in tasks])
            
            # Send results count instead of full payload
            yield f"data: {{\"status\": \"complete\", \"count\": {len(results)}, \"message\": \"Analysis completed\"}}\n\n"
            
            # Send results in chunks to avoid SSE size limits
            chunk_size = 5
            for i in range(0, len(results), chunk_size):
                chunk = results[i:i+chunk_size]
                yield f"data: {{\"status\": \"data\", \"results\": {json.dumps(chunk)}}}\n\n"
        
        except Exception as e:
            error_msg = str(e).replace('"', '\\"').replace('\n', ' ')
            yield f"data: {{\"status\": \"error\", \"message\": \"{error_msg}\"}}\n\n"
    
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
