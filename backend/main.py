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


@app.post("/osce/analyze-transcript", response_model=AnalyzeResponse)
async def analyze_transcript_endpoint(
    file: Optional[UploadFile] = File(None),
    transcript: Optional[str] = Form(None),
    model_id: Optional[str] = Form(None)
):
    """Analyze OSCE transcript using AWS Bedrock - accepts file upload or text"""
    try:
        # Get transcript from file or form data
        if file:
            content = await file.read()
            transcript_text = content.decode('utf-8')
        elif transcript:
            transcript_text = transcript
        else:
            raise HTTPException(status_code=400, detail="Either file or transcript text required")
        
        # Generate unique report ID
        report_id = str(uuid.uuid4())
        
        # Call Bedrock to analyze transcript
        report_text = await analyze_transcript_with_bedrock(transcript_text, model_id)
        
        # Parse JSON response
        try:
            # Clean response - remove markdown, extra text
            cleaned_text = report_text.strip()
            
            # Remove markdown code blocks
            if '```json' in cleaned_text:
                cleaned_text = cleaned_text.split('```json', 1)[1]
                cleaned_text = cleaned_text.split('```', 1)[0]
            elif '```' in cleaned_text:
                cleaned_text = cleaned_text.split('```', 1)[1]
                cleaned_text = cleaned_text.rsplit('```', 1)[0]
            
            # Find JSON object
            start = cleaned_text.find('{')
            end = cleaned_text.rfind('}') + 1
            if start != -1 and end > start:
                cleaned_text = cleaned_text[start:end]
            
            report_data = json.loads(cleaned_text)
            
            # Clean timestamps - remove milliseconds
            for item in report_data.get('checklist', []):
                if item.get('timestamp'):
                    item['timestamp'] = item['timestamp'].split('.')[0].split(',')[0][:8]
                if item.get('timestamp_end'):
                    item['timestamp_end'] = item['timestamp_end'].split('.')[0].split(',')[0][:8]
                    
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            print(f"Response: {report_text[:1000]}")
            raise HTTPException(status_code=500, detail=f"LLM did not return valid JSON: {str(e)}")
        
        # Generate PDF report
        pdf_path = generate_pdf_report(report_id, transcript_text, report_data, model_id)
        
        # Save JSON for API access
        report = OSCEReport(
            id=report_id,
            created_at=datetime.utcnow().isoformat(),
            transcript=transcript_text,
            report=json.dumps(report_data),
            model_id=model_id
        )
        
        report_path = REPORTS_DIR / f"{report_id}.json"
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report.model_dump(), f, indent=2, ensure_ascii=False)
        
        return AnalyzeResponse(
            success=True,
            report_id=report_id,
            message="Analysis completed successfully"
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reports/{report_id}", response_model=OSCEReport)
async def get_report(report_id: str):
    """Retrieve a specific OSCE report by ID (tries S3 first, then local)"""
    try:
        # Try S3 first
        try:
            report_data = get_report_from_s3(report_id)
            return OSCEReport(**report_data)
        except:
            # Fallback to local file
            report_path = REPORTS_DIR / f"{report_id}.json"
            
            if not report_path.exists():
                raise HTTPException(status_code=404, detail="Report not found")
            
            with open(report_path, "r", encoding="utf-8") as f:
                report_data = json.load(f)
            
            return OSCEReport(**report_data)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reports/{report_id}/pdf")
async def get_report_pdf(report_id: str):
    """Download PDF report"""
    try:
        pdf_path = REPORTS_DIR / f"{report_id}.pdf"
        if not pdf_path.exists():
            raise HTTPException(status_code=404, detail="PDF report not found")
        
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"osce_report_{report_id}.pdf"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reports")
async def list_reports():
    """List all available reports (combines S3 and local)"""
    try:
        # Get reports from S3
        s3_reports = list_reports_from_s3()
        
        # Get local reports
        local_reports = []
        for report_file in REPORTS_DIR.glob("*.json"):
            with open(report_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                local_reports.append({
                    "id": data["id"],
                    "created_at": data.get("created_at", "unknown"),
                    "source": "local"
                })
        
        # Mark S3 reports
        for report in s3_reports:
            report["source"] = "s3"
            report["created_at"] = report.pop("last_modified")
        
        # Combine and sort
        all_reports = s3_reports + local_reports
        all_reports.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
        return {"reports": all_reports}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
