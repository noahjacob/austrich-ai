import os
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Load environment variables
AWS_BEARER_TOKEN = os.getenv("AWS_BEARER_TOKEN_BEDROCK")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-3-5-sonnet-20241022-v2:0")


# Load the prompt from file for easy editing
def load_prompt():
    prompt_file = Path(__file__).parent / "prompt.txt"
    if prompt_file.exists():
        return prompt_file.read_text(encoding='utf-8')
    # Fallback prompt if file doesn't exist
    return """You are an expert medical educator evaluating an OSCE (Objective Structured Clinical Examination) performance.

Analyze the following transcript and provide a comprehensive evaluation including:
- Overall assessment
- Clinical knowledge demonstrated
- Communication skills
- Physical examination technique
- Key strengths and areas for improvement
- Critical actions that were missed (if any)

Transcript:
{transcript}"""


async def analyze_transcript_with_bedrock(transcript: str) -> str:
    """
    Analyze OSCE transcript using AWS Bedrock with bearer token authentication
    Returns the full text response from the model
    """
    if not AWS_BEARER_TOKEN:
        raise ValueError("AWS_BEARER_TOKEN_BEDROCK environment variable not set")
    
    # Clean the token (remove any whitespace/newlines)
    clean_token = AWS_BEARER_TOKEN.strip()
    
    try:
        print(f"DEBUG: Token loaded (length: {len(clean_token)})")
        print(f"DEBUG: Using model: {BEDROCK_MODEL_ID}")
        print(f"DEBUG: Region: {AWS_REGION}")
        
        # Load and prepare the prompt
        prompt_template = load_prompt()
        prompt = prompt_template.format(transcript=transcript)
        
        # Prepare the API request
        url = f"https://bedrock-runtime.{AWS_REGION}.amazonaws.com/model/{BEDROCK_MODEL_ID}/converse"
        
        headers = {
            "Authorization": f"Bearer {clean_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": prompt}]
                }
            ]
        }
        
        # Make the HTTP request
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code != 200:
            raise Exception(f"HTTP {response.status_code}: {response.text}")
        
        # Extract the response text
        result = response.json()
        report_text = result['output']['message']['content'][0]['text']
        return report_text
    
    except Exception as e:
        print(f"DEBUG: Full error: {e}")
        raise Exception(f"Error calling Bedrock API: {str(e)}")
