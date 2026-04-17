// ─── Domain Types ────────────────────────────────────────────────────────────
// Pure TypeScript — zero React Native / Expo imports.
// Shared across all layers.

export type Role = 'user' | 'assistant';

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  text: string;
  timestampMs: number;
  isStreaming: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  lastUpdatedAt: number;
  systemPrompt: string;
  maxContextTurns: number;
  temperature: number;
  ttsSpeed: number;
  maxResponseTokens: number;
}

export type PipelinePhase = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';

export interface PipelineState {
  phase: PipelinePhase;
  partialSttText: string;
  partialLlmText: string;
  error: string | null;
}

export interface SttResult {
  text: string;
  isFinal: boolean;
}

export interface TtsAudioChunk {
  samples: Float32Array;
  sampleRate: number;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  currentFile: string;
}

export interface ModelProgressUpdate {
  action: string;
  totalSize: number;
  filesProcessed: number;
  currentFile: string;
  overallProgress: number;
}

export type TtsEngineId = 'supertonic' | 'system';
export type TtsBufferMode = 'streaming' | 'buffered';

export interface AppSettings {
  sttLanguage: string;
  llmSystemPrompt: string;
  llmTemperature: number;
  llmMaxTokens: number;
  ttsVoice: string;
  ttsSpeed: number;
  ttsPitch: number;
  ttsEngine: TtsEngineId;
  ttsBufferMode: TtsBufferMode;
  ttsSystemLanguage: string;
  useGpu: boolean;
}
