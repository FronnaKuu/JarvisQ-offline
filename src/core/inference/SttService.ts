// ─── STT Service ─────────────────────────────────────────────────────────────
// Wraps @qvac/sdk transcription — supports both Whisper and Parakeet engines.
//
// Accepts a recording URI (file://... from expo-av). The URI is converted to
// an absolute path and passed as a filePath to transcribe(). The SDK
// server-side handler detects the format via the file extension and uses
// FFmpegDecoder to convert it to f32le PCM. Works for Whisper and Parakeet.

import { loadModel, transcribe, transcribeStream, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';
import { loadModelWithFallback } from '@core/utils/loadWithFallback';
import type { LoadModelArgs } from '@core/utils/loadWithFallback';
import type { ISttService } from './types';

// ─── Config types ─────────────────────────────────────────────────────────────

export interface WhisperSttLoadConfig {
  engine: 'whisper';
  modelConstant: { src: string; modelId: string };
  language: string;
  nThreads: number;
  vadThreshold: number;
  vadMinSpeechDurationMs: number;
  vadMinSilenceDurationMs: number;
  useGpu: boolean;
}

export interface ParakeetSttLoadConfig {
  engine: 'parakeet';
  /** Primary model source (encoder for TDT, main model for CTC). */
  modelSrc: { src: string };
  /** TDT only — companion data file for the encoder ONNX (FP32 variant). */
  encoderDataSrc?: { src: string };
  decoderSrc: { src: string };
  preprocessorSrc: { src: string };
  vocabSrc: { src: string };
  /**
   * Silero VAD ONNX model. Only consumed by the streaming path
   * (transcribeStream duplex); the non-streaming transcribe() call
   * ignores it. Resolved into vadModelPath by the SDK plugin and passed
   * to the native addon's startStreaming().
   */
  vadModelSrc?: { src: string };
  /** 'tdt' (default) or 'ctc' */
  modelType: 'tdt' | 'ctc';
  useGpu: boolean;
  maxThreads?: number;
}

/** Union of all supported STT engine configs. */
export type SttLoadConfig = WhisperSttLoadConfig | ParakeetSttLoadConfig;

const BLANK_AUDIO_MARKER = '[BLANK_AUDIO]';

class SttServiceClass implements ISttService {
  private modelId: string | null = null;

  get isLoaded(): boolean {
    return this.modelId !== null;
  }

  async load(
    config: SttLoadConfig,
    onProgress?: (p: ModelProgressUpdate) => void,
    httpFallbackConfig?: SttLoadConfig,
  ): Promise<void> {
    if (this.modelId) await this.unload();

    console.log(
      `[SttService] load engine=${config.engine} gpu=${config.useGpu}`,
    );
    const primary = buildLoadModelArgs(config);
    const fallback = httpFallbackConfig
      ? buildLoadModelArgs(httpFallbackConfig)
      : undefined;

    if (fallback) {
      this.modelId = await loadModelWithFallback({
        primary,
        httpFallback: fallback,
        onProgress,
      });
    } else {
      this.modelId = await (loadModel as Function)({ ...primary, onProgress });
    }
  }

  /**
   * Transcribes a recorded audio file identified by its URI.
   * The URI (e.g. file:///data/…/recording.m4a) is stripped to an absolute
   * path and passed as a filePath to transcribe(). The SDK server decodes it
   * via FFmpegDecoder (handles WAV, 3GPP, AAC, M4A, etc.).
   * Returns the final trimmed text, or '' if no speech was detected.
   *
   * NOTE: transcribe() returns the complete text in one shot. onPartial is
   * called once with the final result for API compatibility with the caller,
   * which previously relied on streaming partials from transcribeStream. If
   * partial updates become necessary again, migrate to the bidirectional
   * session-based transcribeStream overload — but that one is Whisper-only
   * in @qvac/sdk 0.9 and would not work with Parakeet.
   */
  async transcribeFile(
    uri: string,
    onPartial: (text: string) => void,
  ): Promise<string> {
    if (!this.modelId) throw new Error('STT model not loaded');

    // Strip file:// scheme and decode URI encoding → absolute path for bare-fs
    const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));

    const raw = await transcribe({
      modelId: this.modelId,
      audioChunk: filePath,
    });

    const text = raw.includes(BLANK_AUDIO_MARKER) ? '' : raw.trim();
    if (text) onPartial(text);
    return text;
  }

  /**
   * VAD-driven live transcription — opens a transcribeStream duplex session
   * against the loaded parakeet model and pumps PCM chunks from `pcmStream`.
   * Each detected speech segment is yielded via `onSegment` and accumulated
   * into the returned concatenated text.
   *
   * Caller stops the stream by returning from its AsyncIterable (e.g. the
   * LivePcmRecorder's `chunks()` terminates when its `stop()` is called).
   */
  async transcribeLive(
    pcmStream: AsyncIterable<Uint8Array>,
    onSegment: (text: string) => void,
  ): Promise<string> {
    if (!this.modelId) throw new Error('STT model not loaded');

    console.log('[transcribeLive] opening duplex session…');
    const session = (await (transcribeStream as unknown as (
      params: { modelId: string },
    ) => Promise<TranscribeStreamSession>)({ modelId: this.modelId })) as TranscribeStreamSession;
    console.log('[transcribeLive] duplex session open');

    let chunkCount = 0;
    // Pump PCM chunks into the duplex session in the background. The server
    // streams partial transcripts back through the session's AsyncIterable,
    // which we consume synchronously below.
    const pumpPromise = (async () => {
      try {
        for await (const chunk of pcmStream) {
          try {
            session.write(chunk);
            chunkCount++;
            if (chunkCount === 1 || chunkCount % 25 === 0) {
              console.log(`[transcribeLive] chunks written=${chunkCount} lastBytes=${chunk.byteLength}`);
            }
          } catch (err) {
            console.error('[transcribeLive] session.write threw', err);
            throw err;
          }
        }
      } catch (err) {
        console.error('[transcribeLive] pcmStream iteration threw', err);
        throw err;
      } finally {
        console.log(`[transcribeLive] stream drained, total chunks=${chunkCount}, calling session.end()`);
        session.end();
      }
    })();

    let fullText = '';
    let segmentCount = 0;
    try {
      // The SDK duplex session iterator yields each segment as a plain string
      // (see @qvac/sdk client transcribe.js → parseResponseLines/processLine).
      // Empty strings and the terminal "done" marker are already filtered out.
      for await (const segment of session as AsyncIterable<string>) {
        if (!segment) continue;
        segmentCount++;
        console.log(`[transcribeLive] segment #${segmentCount} len=${segment.length}`);
        onSegment(segment);
        fullText += (fullText ? ' ' : '') + segment.trim();
      }
    } catch (err) {
      console.error('[transcribeLive] session iteration threw', err);
      session.destroy?.();
      throw err;
    }
    await pumpPromise;
    return fullText;
  }

  async unload(): Promise<void> {
    if (!this.modelId) return;
    await unloadModel({ modelId: this.modelId });
    this.modelId = null;
  }
}

/**
 * Minimal shape of the duplex session returned by @qvac/sdk transcribeStream
 * when called without audioChunk. We redeclare it here because the SDK
 * exposes it as an anonymous inline type.
 *
 * NOTE: the SDK's parseResponseLines unwraps server frames and yields each
 * non-empty segment as a plain string (it returns null on the terminal
 * "done" frame, which ends iteration). The async iterator is therefore
 * over strings, not response objects.
 */
interface TranscribeStreamSession extends AsyncIterable<string> {
  write(audioChunk: Uint8Array): void;
  end(): void;
  destroy?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLoadModelArgs(config: SttLoadConfig): LoadModelArgs {
  if (config.engine === 'whisper') {
    return {
      modelSrc: config.modelConstant.src,
      modelType: 'whisper',
      modelConfig: {
        language: config.language,
        strategy: 'greedy' as const,
        n_threads: config.nThreads,
        suppress_blank: true,
        suppress_nst: true,
        audio_format: 'f32le' as const,
        vad_params: {
          threshold: config.vadThreshold,
          min_speech_duration_ms: config.vadMinSpeechDurationMs,
          min_silence_duration_ms: config.vadMinSilenceDurationMs,
        },
        contextParams: {
          use_gpu: config.useGpu,
        },
      },
    };
  }

  // Parakeet (TDT or CTC)
  return {
    modelSrc: config.modelSrc.src,
    modelType: 'parakeet-transcription',
    modelConfig: {
      modelType: config.modelType,
      parakeetEncoderSrc: config.modelSrc,
      ...(config.encoderDataSrc && { parakeetEncoderDataSrc: config.encoderDataSrc }),
      parakeetDecoderSrc: config.decoderSrc,
      parakeetPreprocessorSrc: config.preprocessorSrc,
      parakeetVocabSrc: config.vocabSrc,
      ...(config.vadModelSrc && { vadModelSrc: config.vadModelSrc }),
      useGPU: config.useGpu,
      ...(config.maxThreads !== undefined && { maxThreads: config.maxThreads }),
    },
  };
}

export const SttService = new SttServiceClass();
