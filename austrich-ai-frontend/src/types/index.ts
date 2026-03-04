// API Response Types

export interface SubItem {
  item: string;
  status: 'Yes' | 'No' | 'Not Sure';
  reasoning: string;
  evidence: string | null;
  timestamp: string | null;
  timestamp_end?: string | null;
}

export interface ChecklistItem {
  item: string;
  has_subitems: boolean;
  // For items without sub-items
  status?: 'Yes' | 'No' | 'Not Sure';
  evidence?: string | null;
  timestamp?: string | null;
  timestamp_end?: string | null;
  // For items with sub-items
  threshold?: string;
  overall_status?: 'Yes' | 'No' | 'Not Sure';
  subitems?: SubItem[];
  // Legacy fields
  completed?: boolean;
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

