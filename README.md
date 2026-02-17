# AuSTRICH-AI

AI-powered OSCE (Objective Structured Clinical Examination) analysis platform using AWS Bedrock.

## Features

- **Multiple AI Models**: Choose between Claude 4.5 Haiku, 4.5 Sonnet, or 4.6 Opus
- **Batch Processing**: Run multiple analyses in parallel for consistency testing
- **S3 Integration**: Store transcripts and reports in AWS S3 buckets
- **Real-time Analysis**: Get instant feedback on OSCE performance

## Setup

### 1. Create Python Virtual Environment

```cmd
python -m venv venv
```

### 2. Activate Virtual Environment

Windows CMD:
```cmd
venv\Scripts\activate
```

### 3. Install Python Dependencies

```cmd
pip install -r requirements.txt
```

### 4. Configure AWS Credentials

Edit `backend/.env` and add your AWS credentials:

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
S3_INPUT_BUCKET=austrich-ai-input
S3_OUTPUT_BUCKET=austrich-ai-output
```

### 5. Create S3 Buckets

Create two S3 buckets in your AWS account:
- `austrich-ai-input` - for transcript files
- `austrich-ai-output` - for generated reports

### 6. Run Backend

```cmd
cd backend
python main.py
```

Backend runs on `http://localhost:8000`

### 7. Run Frontend

In a new terminal:

```cmd
cd austrich-ai-frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

## Usage

### Analyze Transcripts

1. Upload transcript files (.txt) to the `austrich-ai-input` S3 bucket
2. Select a transcript from the dropdown in the UI
3. Choose an AI model (Haiku, Sonnet, or Opus)
4. Set batch count (1-10) for consistency testing
5. Click "Analyze Transcript" to generate reports

### Batch Processing

Run the same transcript multiple times in parallel:
- Set batch count to 5 for 5 parallel analyses
- All reports complete in the same time as a single report

### View Reports

- Navigate to the Reports page to view all generated reports
- Reports are stored in S3 with model name and timestamp

## Customization

### Edit AI Prompt

The OSCE evaluation prompt can be customized by editing:

```
backend/prompt.txt
```

### Available Models

- **Claude 4.5 Haiku**: Fast and cost-effective
- **Claude 4.5 Sonnet**: Balanced performance
- **Claude 4.6 Opus**: Most capable model
