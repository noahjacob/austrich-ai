// API Response Types

export interface ChecklistItem {
  item: string;
  completed: boolean;
  notes?: string;
}

export interface TimestampedFeedback {
  timestamp: number; // in seconds
  feedback: string;
  category: 'clinical_knowledge' | 'communication' | 'physical_exam' | 'critical_action';
}

export interface OSCEReport {
  id: string;
  overall_score: number;
  checklist_results: ChecklistItem[];
  timestamped_feedback: TimestampedFeedback[];
  clinical_knowledge: {
    score: number;
    feedback: string[];
  };
  communication: {
    score: number;
    feedback: string[];
  };
  physical_exam: {
    score: number;
    feedback: string[];
  };
  missed_critical_actions: string[];
  created_at: string;
  transcript?: string;
  report?: string; // Full text report from Bedrock
}

export interface AnalyzeTranscriptRequest {
  transcript?: string;
  file?: File;
  model_id?: string;
}

export interface AnalyzeVideoRequest {
  video_file: File;
  timestamp?: number; // in seconds
}

export interface AnalyzeResponse {
  report_id: string;
  message: string;
}

export interface ApiError {
  detail: string;
  error?: string;
}

