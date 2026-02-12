import os
import boto3
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
    
    # Set the bearer token as environment variable for boto3
    os.environ['AWS_BEARER_TOKEN_BEDROCK'] = AWS_BEARER_TOKEN
    
    try:
        # Create the Bedrock client - boto3 will automatically look for AWS_BEARER_TOKEN_BEDROCK
        # This is AWS's new API key authentication for Bedrock
        client = boto3.client(
            service_name="bedrock-runtime",
            region_name=AWS_REGION
        )
        
        # Load and prepare the prompt
        prompt_template = load_prompt()
        prompt = prompt_template.format(transcript=transcript)
        
        print(f"DEBUG: Using model: {BEDROCK_MODEL_ID}")
        print(f"DEBUG: Region: {AWS_REGION}")
        
        # Prepare the message
        messages = [
            {
                "role": "user",
                "content": [{"text": prompt}]
            }
        ]
        
        # Make the API call using converse
        response = client.converse(
            modelId=BEDROCK_MODEL_ID,
            messages=messages,
        )
        
        # Extract the response text
        report_text = response['output']['message']['content'][0]['text']
        return report_text
    
    except Exception as e:
        print(f"DEBUG: Full error: {e}")
        raise Exception(f"Error calling Bedrock API: {str(e)}")
