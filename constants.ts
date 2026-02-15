import { SupportedLanguage } from './types';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'zh-CN', name: 'Chinese Simplified (简体中文)' },
  { code: 'zh-TW', name: 'Chinese Traditional (繁體中文)' },
  { code: 'ko', name: 'Korean (한국어)' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'th', name: 'Thai (ภาษาไทย)' },
];

export const MAX_FILE_SIZE_MB = 100;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const GEMINI_MODEL = 'gemini-3-flash-preview'; 

export const SYSTEM_INSTRUCTION = `You are an expert technical writer and instructional designer. 
Your task is to create clear, concise, and accurate step-by-step procedure manuals based on video content. 
You analyze both audio narration and visual actions to synthesize the most complete instructions possible.`;
