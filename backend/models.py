from pydantic import BaseModel
from typing import Optional


# What the frontend sends to analyze a transcript
class AnalyzeTranscriptRequest(BaseModel):
    transcript: str
    model_id: Optional[str] = None
    prompt_name: Optional[str] = "prompt"


# Request to analyze from S3 input bucket
class AnalyzeFromS3Request(BaseModel):
    file_key: str
    model_id: Optional[str] = None
    batch_count: Optional[int] = 1
    prompt_name: Optional[str] = "prompt"


# What the backend sends back after starting analysis
class AnalyzeResponse(BaseModel):
    success: bool
    report_id: str
    message: str


# The full OSCE report that gets saved and displayed
class OSCEReport(BaseModel):
    id: str
    created_at: str
    transcript: str
    report: str  # The full report text from Bedrock
    source_file: Optional[str] = None  # S3 file key if from S3
    model_id: Optional[str] = None  # Model used for analysis
    # Optional structured fields (for future use)
    overall_score: Optional[int] = None
    checklist_results: Optional[list] = None
    timestamped_feedback: Optional[list] = None
    clinical_knowledge: Optional[dict] = None
    communication: Optional[dict] = None
    physical_exam: Optional[dict] = None
    missed_critical_actions: Optional[list] = None
