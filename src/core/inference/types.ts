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
  /**
   * Transcribes a recorded audio file (any format — the @qvac/sdk server-side
   * decoder converts it to f32le PCM before passing to Whisper).
   * Yields partial text via onPartial.
   */
  transcribeFile(
    uri: string,
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

import type { IAudioPlayer } from '@core/ports/IAudioPlayer';

export interface TtsRuntimeOptions {
  speed?: number;
  pitch?: number;
  /** BCP-47 language tag (e.g. "en-US", "it-IT"). Only honored by the system engine. */
  language?: string;
}

export interface ITtsService {
  readonly isLoaded: boolean;
  /**
   * Synthesizes and plays a chunk of text. Resolves when playback finishes.
   * Engines that return PCM use the provided audioPlayer; engines with their
   * own native playback (system TTS) may ignore it.
   */
  speak(
    text: string,
    audioPlayer: IAudioPlayer,
    options?: TtsRuntimeOptions,
  ): Promise<void>;
  /** Aborts ongoing playback/synthesis without unloading the engine. */
  stop(): Promise<void>;
}
