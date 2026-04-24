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

  /**
   * Streams a live PCM feed into the parakeet addon's VAD-driven streaming
   * path. Each detected speech segment emits a transcript via `onSegment`.
   * The returned controller exposes `stop()` (graceful flush) and the
   * accumulated transcript is available after stop() resolves.
   *
   * Only parakeet is supported at runtime; whisper's streaming API would
   * require a different wire format. Throws when called on a non-parakeet
   * or when the loaded parakeet profile lacks vadModelSrc.
   */
  transcribeLive(
    pcmStream: AsyncIterable<Uint8Array>,
    onSegment: (text: string) => void,
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

// ─── Translator (NMT) ────────────────────────────────────────────────────────

export interface ITranslatorService {
  readonly isLoaded: boolean;
  /** Direction the currently loaded model covers, or null when unloaded. */
  readonly direction: { from: string; to: string } | null;
  /**
   * Translates a full sentence/utterance. Streams target-language tokens via
   * onToken (Bergamot emits them in bursts rather than char-by-char). Returns
   * the final translation.
   */
  translate(
    text: string,
    onToken: (token: string) => void,
  ): Promise<string>;
  /** Cancels an in-flight translation. */
  cancel(): void;
}

// ─── Responder ───────────────────────────────────────────────────────────────
// Unified abstraction the VoicePipeline talks to. Both the LLM and the NMT
// translator implement it, so the pipeline itself stays mode-agnostic.

export interface IResponder {
  /** Stable identifier of the responder kind, for logging. */
  readonly kind: 'llm' | 'translation';
  /**
   * Produces a response to the user's utterance. For chat mode this is the
   * assistant turn; for translation mode this is the translated sentence.
   * History is provided so LLM responders can use it; stateless responders
   * (Bergamot NMT) ignore it.
   */
  respond(
    userText: string,
    history: ConversationMessage[],
    onToken: (token: string) => void,
  ): Promise<string>;
  /** Cancels an in-flight respond() call. */
  cancel(): void;
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
