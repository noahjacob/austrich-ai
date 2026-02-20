import os
import boto3
from pathlib import Path
from dotenv import load_dotenv
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Load environment variables from .env file
load_dotenv()

# Load environment variables
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-3-5-sonnet-20241022-v2:0")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")

# Thread pool for parallel execution
executor = ThreadPoolExecutor(max_workers=10)


# Load the prompt from file for easy editing
def load_prompt(prompt_name: str = "prompt"):
    prompt_file = Path(__file__).parent / f"{prompt_name}.txt"
    if prompt_file.exists():
        return prompt_file.read_text(encoding='utf-8')
    # Fallback to default prompt.txt
    default_file = Path(__file__).parent / "prompt.txt"
    if default_file.exists():
        return default_file.read_text(encoding='utf-8')
    # Final fallback prompt if no file exists
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




def _call_bedrock_sync(transcript: str, model_id: str, prompt_name: str = "prompt") -> str:
    """Synchronous Bedrock call to run in thread pool"""
    # Create Bedrock client (each thread gets its own)
    bedrock = boto3.client(
        service_name='bedrock-runtime',
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY
    )

    # Load and prepare the prompt
    prompt_template = load_prompt(prompt_name)
    prompt = prompt_template.replace("{transcript}", transcript)
    
    # Prepare the request payload
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [{"text": prompt}]
            }
        ]
    }
    
    # Call Bedrock Converse API
    response = bedrock.converse(
        modelId=model_id,
        messages=payload["messages"]
    )
    
    # Extract the response text
    return response['output']['message']['content'][0]['text']


async def analyze_transcript_with_bedrock(transcript: str, model_id: str = None, prompt_name: str = "prompt") -> str:
    """
    Analyze OSCE transcript using AWS Bedrock with proper AWS credentials
    Returns the full text response from the model
    """
    # Use provided model_id or fall back to environment variable
    if model_id is None:
        model_id = BEDROCK_MODEL_ID

    try:
        print(f"DEBUG: Using model: {model_id}, prompt: {prompt_name}")

        # Run the synchronous boto3 call in a thread pool for true parallelism
        loop = asyncio.get_event_loop()
        report_text = await loop.run_in_executor(executor, _call_bedrock_sync, transcript, model_id, prompt_name)
        return report_text

    except Exception as e:
        print(f"DEBUG: Full error: {e}")
        raise Exception(f"Error calling Bedrock API: {str(e)}")
