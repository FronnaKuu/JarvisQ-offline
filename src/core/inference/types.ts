// ─── Inference Service Interfaces ────────────────────────────────────────────
// Abstract contracts for STT, LLM, and TTS services.
// VoicePipeline depends on these interfaces — never on concrete implementations.
// This enables unit-testing with mock implementations.

import type { ModelProgressUpdate } from '@qvac/sdk';

export type ProgressCallback = (p: ModelProgressUpdate) => void;
export type ConversationMessage = { role: string; content: string };

// ─── STT ─────────────────────────────────────────────────────────────────────

export interface ISttService {
  readonly isLoaded: boolean;
  /** Transcribes a raw f32le PCM Buffer. Yields partial text via onPartial. */
  transcribeBuffer(
    pcmF32le: Buffer,
    onPartial: (text: string) => void,
  ): Promise<string>;
}

// ─── LLM ─────────────────────────────────────────────────────────────────────

export interface ILlmService {
  readonly isLoaded: boolean;
  /** Streams tokens via onToken, returns full response text. */
  generate(
    history: ConversationMessage[],
    onToken: (token: string) => void,
  ): Promise<string>;
  /** Cancels the current in-flight generation. */
  cancelGeneration(): void;
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

export interface ITtsService {
  readonly isLoaded: boolean;
  readonly sampleRate: number;
  /** Synthesizes text and returns Float32 PCM samples. */
  synthesize(text: string): Promise<Float32Array>;
}
