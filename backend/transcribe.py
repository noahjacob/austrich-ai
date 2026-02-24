import boto3
import os
import uuid
import asyncio
import requests
from dotenv import load_dotenv

load_dotenv()

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
S3_INPUT_BUCKET = os.getenv("S3_INPUT_BUCKET", "austrich-ai-input")


def get_transcribe_client():
    return boto3.client(
        'transcribe',
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY
    )


def get_s3_client():
    return boto3.client(
        's3',
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY
    )


async def transcribe_audio_file(audio_file_key: str) -> str:
    """Transcribe audio from S3, return formatted transcript"""
    transcribe = get_transcribe_client()
    
    job_name = f"osce-{uuid.uuid4()}"
    audio_uri = f"s3://{S3_INPUT_BUCKET}/{audio_file_key}"
    
    file_ext = audio_file_key.split('.')[-1].lower()
    format_map = {'mp3': 'mp3', 'wav': 'wav', 'm4a': 'mp4', 'flac': 'flac', 'ogg': 'ogg', 'webm': 'webm'}
    media_format = format_map.get(file_ext, 'mp3')
    
    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={'MediaFileUri': audio_uri},
        MediaFormat=media_format,
        LanguageCode='en-US',
        Settings={
            'ShowSpeakerLabels': True,
            'MaxSpeakerLabels': 2
        }
    )
    
    while True:
        status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
        job_status = status['TranscriptionJob']['TranscriptionJobStatus']
        
        if job_status in ['COMPLETED', 'FAILED']:
            break
        
        await asyncio.sleep(5)
    
    if job_status == 'FAILED':
        raise Exception("Transcription failed")
    
    transcript_uri = status['TranscriptionJob']['Transcript']['TranscriptFileUri']
    transcript_data = requests.get(transcript_uri).json()
    
    formatted_transcript = format_transcript(transcript_data)
    
    transcribe.delete_transcription_job(TranscriptionJobName=job_name)
    
    return formatted_transcript


def format_transcript(data: dict) -> str:
    """Format transcript with speaker labels and timestamps"""
    lines = []
    
    if 'results' not in data:
        return ""
    
    segments = data['results'].get('speaker_labels', {}).get('segments', [])
    items = data['results'].get('items', [])
    
    for segment in segments:
        speaker_label = segment.get('speaker_label', 'spk_0')
        speaker = "Student" if speaker_label == "spk_0" else "Patient"
        start_time = float(segment.get('start_time', 0))
        
        words = []
        for item in segment.get('items', []):
            item_start = item.get('start_time')
            for word_item in items:
                if word_item.get('start_time') == item_start:
                    words.append(word_item['alternatives'][0]['content'])
                    break
        
        if words:
            text = ' '.join(words)
            timestamp = format_time(start_time)
            lines.append(f"[{timestamp}] {speaker}: {text}")
    
    return '\n'.join(lines)


def format_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"
