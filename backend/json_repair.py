import re
import json

def repair_json(text: str) -> str:
    """
    Repair common JSON formatting issues from LLM outputs
    """
    # Remove markdown code blocks
    if '```json' in text:
        text = text.split('```json', 1)[1].split('```', 1)[0]
    elif '```' in text:
        text = text.split('```', 1)[1].rsplit('```', 1)[0]
    
    # Extract JSON object
    start = text.find('{')
    end = text.rfind('}') + 1
    if start != -1 and end > start:
        text = text[start:end]
    
    # Single quotes are valid in JSON strings - no escaping needed
    return text.strip()
