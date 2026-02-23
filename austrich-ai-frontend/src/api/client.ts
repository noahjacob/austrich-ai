import type { AnalyzeTranscriptRequest, AnalyzeVideoRequest, AnalyzeResponse, OSCEReport, ApiError } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `HTTP error! status: ${response.status}`,
    }));
    throw new Error(error.detail || error.error || 'An error occurred');
  }
  return response.json();
}

export async function analyzeTranscript(data: AnalyzeTranscriptRequest): Promise<AnalyzeResponse> {
  const formData = new FormData();
  
  if (data.file) {
    formData.append('file', data.file);
  } else if (data.transcript) {
    formData.append('transcript', data.transcript);
  }
  
  if (data.model_id) {
    formData.append('model_id', data.model_id);
  }
  
  const response = await fetch(`${API_BASE_URL}/osce/analyze-transcript`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<AnalyzeResponse>(response);
}

export async function analyzeVideo(data: AnalyzeVideoRequest): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append('video_file', data.video_file);
  if (data.timestamp !== undefined) {
    formData.append('timestamp', data.timestamp.toString());
  }

  const response = await fetch(`${API_BASE_URL}/osce/analyze-video`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<AnalyzeResponse>(response);
}

export async function listS3InputFiles(): Promise<{ files: Array<{ key: string; size: number; last_modified: string }> }> {
  const response = await fetch(`${API_BASE_URL}/s3/input-files`);
  return handleResponse(response);
}

export async function analyzeFromS3(
  fileKey: string, 
  modelId?: string, 
  batchCount?: number,
  onProgress?: (message: string) => void
): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE_URL}/osce/analyze-from-s3`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_key: fileKey, model_id: modelId, batch_count: batchCount }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `HTTP error! status: ${response.status}`,
    }));
    throw new Error(error.detail || error.error || 'An error occurred');
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let result: AnalyzeResponse | null = null;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          
          if (data.status === 'processing' && onProgress) {
            onProgress(data.message);
          } else if (data.status === 'complete') {
            result = { success: true, report_id: data.report_id, message: data.message };
          } else if (data.status === 'error') {
            throw new Error(data.message);
          }
        }
      }
    }
  }

  if (!result) throw new Error('No result received');
  return result;
}

export async function deleteS3InputFile(fileKey: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/s3/input-files/${encodeURIComponent(fileKey)}`, {
    method: 'DELETE',
  });
  return handleResponse(response);
}

export async function deleteS3OutputFile(fileKey: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/s3/output-files/${encodeURIComponent(fileKey)}`, {
    method: 'DELETE',
  });
  return handleResponse(response);
}

export async function getReport(id: string): Promise<OSCEReport> {
  const response = await fetch(`${API_BASE_URL}/reports/${id}`);
  return handleResponse<OSCEReport>(response);
}

