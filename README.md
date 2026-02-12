# AuSTRICH-AI

AI-powered OSCE (Objective Structured Clinical Examination) analysis platform using AWS Bedrock.

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

### 4. Configure Access Token

Edit `backend/.env` and add your AWS Bedrock bearer token:

```env
AWS_BEARER_TOKEN_BEDROCK=your_actual_token_here
```

### 5. Run Backend

```cmd
cd backend
python main.py
```

Backend runs on `http://localhost:8000`

### 6. Run Frontend

In a new terminal:

```cmd
cd austrich-ai-frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

## Customization

### Edit AI Prompt

The OSCE evaluation prompt can be customized by editing:

```
backend/prompt.txt
```

