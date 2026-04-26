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

/**
 * Two top-level UX modes; the user picks one when creating a chat.
 *   'conversation' — free-form assistant dialogue backed by the LLM.
 *   'translation'  — stateless NMT between two locked languages (Bergamot).
 * Persisted on every conversation so existing chats keep their mode forever.
 */
export type ConversationMode = 'conversation' | 'translation';

export interface Conversation {
  id: string;
  title: string;
  mode: ConversationMode;
  createdAt: number;
  lastUpdatedAt: number;
  systemPrompt: string;
  maxContextTurns: number;
  temperature: number;
  ttsSpeed: number;
  maxResponseTokens: number;
  /** BCP-47 language code for translation chats; null for conversation mode. */
  sourceLang: string | null;
  /** BCP-47 language code for translation chats; null for conversation mode. */
  targetLang: string | null;
}

export type PipelinePhase = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';

/**
 * Live transcription view shown while the user is dictating. Mirrors
 * HearoPilot's split between completed VAD segments (append-only) and the
 * still-open partial segment (replaced in place on each native revision).
 * The pipeline owns the source of truth; the UI just renders these two
 * fields side by side.
 */
export interface DictationView {
  committedText: string;
  runningPartial: string;
}

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

/**
 * Engine for translation chats. 'nmt' uses Bergamot (fast, small models, fixed
 * language pairs); 'llm' reuses the main LLM with a translation prompt and
 * covers any pair but is an order of magnitude slower.
 */
export type TranslationEngine = 'nmt' | 'llm';

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
  // When true, the pipeline re-opens the microphone automatically after the
  // assistant finishes speaking (hands-free chaining). Off by default because
  // devices without hardware AEC can capture the decaying TTS output and
  // self-trigger a new turn.
  handsFreeMode: boolean;
  /**
   * Optional override for the dictation end-of-turn debounce. When undefined
   * the pipeline uses AppConfig.stt.dictationAutoCommitMs. Persisted values
   * are clamped into AppConfig.stt.endOfTurnRange by SettingsStore.
   */
  dictationAutoCommitMs?: number;
  // ─── Translation defaults (used when the user creates a new translation
  //     chat; each conversation can override them afterwards) ──────────────
  translationEngine: TranslationEngine;
  translationSourceLang: string;
  translationTargetLang: string;
}
