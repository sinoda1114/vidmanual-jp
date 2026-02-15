
export enum ProcessingStage {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING', // Includes audio/visual analysis
  EXTRACTING_SCREENSHOTS = 'EXTRACTING_SCREENSHOTS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface ManualStep {
  id?: string; // Unique identifier for React keys
  step_number: number;
  timestamp: string; // MM:SS format
  timestamp_seconds: number;
  title: string;
  description: string;
  screenshot_timestamp_seconds: number;
  screenshot_data?: string; // Base64 data URL
}

export interface ManualData {
  title: string;
  language: string;
  steps: ManualStep[];
}

export interface SupportedLanguage {
  code: string;
  name: string;
}

export interface ProcessingState {
  stage: ProcessingStage;
  progress: number; // 0-100
  message: string;
  error?: string;
}
