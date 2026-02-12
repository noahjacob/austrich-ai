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
  const response = await fetch(`${API_BASE_URL}/osce/analyze-transcript`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
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

export async function getReport(id: string): Promise<OSCEReport> {
  const response = await fetch(`${API_BASE_URL}/reports/${id}`);
  return handleResponse<OSCEReport>(response);
}

