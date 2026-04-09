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
def load_prompt(prompt_file: str = "prompt.txt"):
    prompt_path = Path(__file__).parent / prompt_file
    if prompt_path.exists():
        return prompt_path.read_text(encoding='utf-8')
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




def _call_bedrock_sync(transcript: str, model_id: str, prompt_file: str = "prompt.txt") -> str:
    """Synchronous Bedrock call to run in thread pool"""
    import time
    start_time = time.time()
    
    print(f"DEBUG: [{prompt_file}] Creating Bedrock client...")
    # Create Bedrock client (each thread gets its own)
    bedrock = boto3.client(
        service_name='bedrock-runtime',
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY
    )
    client_time = time.time() - start_time
    print(f"DEBUG: [{prompt_file}] Bedrock client created in {client_time:.2f}s")
    
    # Load and prepare the prompt
    prompt_template = load_prompt(prompt_file)
    
    # Check if prompt needs transcript placeholder
    if '{transcript}' in prompt_template:
        prompt = prompt_template.format(transcript=transcript)
    else:
        # Prompt ends with "TRANSCRIPT:" - just append
        prompt = prompt_template + "\n" + transcript
    
    prompt_time = time.time() - start_time
    print(f"DEBUG: [{prompt_file}] Prompt prepared in {prompt_time:.2f}s (length: {len(prompt)} chars)")
    
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
    api_start = time.time()
    print(f"DEBUG: [{prompt_file}] Calling Bedrock API with model {model_id}...")
    response = bedrock.converse(
        modelId=model_id,
        messages=payload["messages"]
    )
    api_time = time.time() - api_start
    print(f"DEBUG: [{prompt_file}] Bedrock API responded in {api_time:.2f}s")
    
    # Extract the response text
    result = response['output']['message']['content'][0]['text']
    total_time = time.time() - start_time
    print(f"DEBUG: [{prompt_file}] Total time: {total_time:.2f}s, Response length: {len(result)} chars")
    return result


async def analyze_transcript_with_bedrock(transcript: str, model_id: str = None, prompt_file: str = "prompt.txt") -> str:
    """
    Analyze OSCE transcript using AWS Bedrock with proper AWS credentials
    Returns the full text response from the model
    """
    # Use provided model_id or fall back to environment variable
    if model_id is None:
        model_id = BEDROCK_MODEL_ID
    
    try:
        print(f"DEBUG: [{prompt_file}] Starting analysis with model: {model_id}")
        
        # Run the synchronous boto3 call in a thread pool for true parallelism
        import time
        start = time.time()
        loop = asyncio.get_event_loop()
        
        # Add timeout of 120 seconds (2 minutes)
        report_text = await asyncio.wait_for(
            loop.run_in_executor(executor, _call_bedrock_sync, transcript, model_id, prompt_file),
            timeout=120.0
        )
        
        elapsed = time.time() - start
        print(f"DEBUG: [{prompt_file}] Completed in {elapsed:.2f}s")
        return report_text
    
    except asyncio.TimeoutError:
        print(f"DEBUG: [{prompt_file}] TIMEOUT - Analysis exceeded 120 seconds")
        raise Exception(f"Analysis timeout for {prompt_file} - exceeded 120 seconds")
    
    except Exception as e:
        print(f"DEBUG: [{prompt_file}] ERROR - Full error type: {type(e).__name__}")
        print(f"DEBUG: [{prompt_file}] ERROR - Full error: {e}")
        print(f"DEBUG: [{prompt_file}] ERROR - Error args: {e.args}")
        if hasattr(e, 'response'):
            print(f"DEBUG: [{prompt_file}] ERROR - Error response: {e.response}")
        raise Exception(f"Error calling Bedrock API: {repr(e)}")
