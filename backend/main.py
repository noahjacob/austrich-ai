from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import uuid
import json
from datetime import datetime

from models import AnalyzeTranscriptRequest, AnalyzeResponse, OSCEReport
from bedrock import analyze_transcript_with_bedrock

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


@app.post("/osce/analyze-transcript", response_model=AnalyzeResponse)
async def analyze_transcript_endpoint(request: AnalyzeTranscriptRequest):
    """Analyze OSCE transcript using AWS Bedrock"""
    try:
        # Generate unique report ID
        report_id = str(uuid.uuid4())
        
        # Call Bedrock to analyze transcript
        report_text = await analyze_transcript_with_bedrock(request.transcript)
        
        # Create report object
        report = OSCEReport(
            id=report_id,
            created_at=datetime.utcnow().isoformat(),
            transcript=request.transcript,
            report=report_text
        )
        
        # Save report to file
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
    """Retrieve a specific OSCE report by ID"""
    try:
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


@app.get("/reports")
async def list_reports():
    """List all available reports"""
    try:
        reports = []
        for report_file in REPORTS_DIR.glob("*.json"):
            with open(report_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                reports.append({
                    "id": data["id"],
                    "created_at": data["created_at"]
                })
        
        # Sort by creation date (newest first)
        reports.sort(key=lambda x: x["created_at"], reverse=True)
        return {"reports": reports}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
