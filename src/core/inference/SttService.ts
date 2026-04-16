// ─── STT Service ─────────────────────────────────────────────────────────────
// Wraps @qvac/sdk transcription — supports both Whisper and Parakeet engines.
//
// Accepts a recording URI (file://... from expo-av). The URI is converted to
// an absolute path and passed as a filePath to transcribeStream(). The SDK
// server-side handler detects the format via the file extension and uses
// FFmpegDecoder to convert it to f32le PCM. Works for Whisper and Parakeet.

import { loadModel, transcribeStream, unloadModel } from '@qvac/sdk';
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
   * The URI (e.g. file:///data/…/recording.wav) is stripped to an absolute
   * path and passed as a filePath to transcribeStream(). The SDK server
   * decodes it via FFmpegDecoder (handles WAV, 3GPP, AAC, M4A, etc.).
   * Yields partial text progressively via onPartial as Whisper processes.
   * Returns the final trimmed text, or '' if no speech was detected.
   */
  async transcribeFile(
    uri: string,
    onPartial: (text: string) => void,
  ): Promise<string> {
    if (!this.modelId) throw new Error('STT model not loaded');

    // Strip file:// scheme and decode URI encoding → absolute path for bare-fs
    const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));

    let fullText = '';
    for await (const chunk of transcribeStream({
      modelId: this.modelId,
      audioChunk: filePath,
    })) {
      if (!chunk.includes(BLANK_AUDIO_MARKER)) {
        fullText += chunk;
        onPartial(fullText.trim());
      }
    }
    return fullText.trim();
  }

  async unload(): Promise<void> {
    if (!this.modelId) return;
    await unloadModel({ modelId: this.modelId });
    this.modelId = null;
  }
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
      useGPU: config.useGpu,
      ...(config.maxThreads !== undefined && { maxThreads: config.maxThreads }),
    },
  };
}

export const SttService = new SttServiceClass();
