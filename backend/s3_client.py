import os
import boto3
import json
from datetime import datetime
from typing import List, Dict
from dotenv import load_dotenv

load_dotenv()

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
S3_INPUT_BUCKET = os.getenv("S3_INPUT_BUCKET", "austrich-ai-input")
S3_OUTPUT_BUCKET = os.getenv("S3_OUTPUT_BUCKET", "austrich-ai-ouput")


def get_s3_client():
    """Create and return S3 client"""
    return boto3.client(
        's3',
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY
    )


def list_input_transcripts() -> List[Dict]:
    """List all transcript files from input bucket"""
    s3 = get_s3_client()
    response = s3.list_objects_v2(Bucket=S3_INPUT_BUCKET)
    
    files = []
    if 'Contents' in response:
        for obj in response['Contents']:
            files.append({
                'key': obj['Key'],
                'size': obj['Size'],
                'last_modified': obj['LastModified'].isoformat()
            })
    return files


def get_transcript_from_s3(file_key: str) -> str:
    """Download and return transcript content from input bucket"""
    s3 = get_s3_client()
    response = s3.get_object(Bucket=S3_INPUT_BUCKET, Key=file_key)
    return response['Body'].read().decode('utf-8')


def save_report_to_s3(report_id: str, transcript: str, report_text: str, source_file: str = None, model_id: str = None):
    """Save report to reports/ folder in output bucket"""
    s3 = get_s3_client()
    
    report_data = {
        'id': report_id,
        'created_at': datetime.utcnow().isoformat(),
        'source_file': source_file,
        'model_id': model_id,
        'transcript': transcript,
        'report': report_text
    }
    
    file_key = f"reports/{report_id}.json"
    
    s3.put_object(
        Bucket=S3_OUTPUT_BUCKET,
        Key=file_key,
        Body=json.dumps(report_data, indent=2, ensure_ascii=False),
        ContentType='application/json'
    )
    return file_key


def get_report_from_s3(report_id: str) -> Dict:
    """Retrieve report from reports/ folder in output bucket"""
    s3 = get_s3_client()
    file_key = f"reports/{report_id}.json"
    response = s3.get_object(Bucket=S3_OUTPUT_BUCKET, Key=file_key)
    return json.loads(response['Body'].read().decode('utf-8'))


def list_reports_from_s3() -> List[Dict]:
    """List all reports from reports/ folder in output bucket"""
    s3 = get_s3_client()
    response = s3.list_objects_v2(Bucket=S3_OUTPUT_BUCKET, Prefix='reports/')
    
    reports = []
    if 'Contents' in response:
        for obj in response['Contents']:
            if obj['Key'].endswith('.json'):
                report_id = obj['Key'].replace('reports/', '').replace('.json', '')
                
                # Fetch report to get source_file info
                try:
                    report_obj = s3.get_object(Bucket=S3_OUTPUT_BUCKET, Key=obj['Key'])
                    report_data = json.loads(report_obj['Body'].read().decode('utf-8'))
                    source_file = report_data.get('source_file', 'Unknown')
                except:
                    source_file = 'Unknown'
                
                reports.append({
                    'id': report_id,
                    'created_at': obj['LastModified'].isoformat(),
                    'source': 's3',
                    'source_file': source_file
                })
    return sorted(reports, key=lambda x: x['created_at'], reverse=True)


def delete_file_from_s3(bucket: str, file_key: str):
    """Delete a file from S3 bucket"""
    s3 = get_s3_client()
    s3.delete_object(Bucket=bucket, Key=file_key)
    return True
