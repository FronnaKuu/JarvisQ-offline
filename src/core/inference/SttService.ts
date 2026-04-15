// ─── STT Service ─────────────────────────────────────────────────────────────
// Wraps @qvac/sdk Whisper transcription.
//
// Accepts a raw f32le PCM Buffer (16kHz mono) — the same format the SDK
// example uses for real-time streaming. AudioRecorder produces this format.
//
// transcribeStream() yields text tokens progressively as Whisper processes the
// audio. Combined with fast VAD-based recording stop, this is as close to
// real-time as possible without raw frame access during recording.

import { loadModel, transcribeStream, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';
import type { ISttService } from './types';

export interface SttLoadConfig {
  modelConstant: { src: string; modelId: string };
  language: string;
  nThreads: number;
  vadThreshold: number;
  vadMinSpeechDurationMs: number;
  vadMinSilenceDurationMs: number;
  useGpu: boolean;
}

const BLANK_AUDIO_MARKER = '[BLANK_AUDIO]';

class SttServiceClass implements ISttService {
  private modelId: string | null = null;

  get isLoaded(): boolean {
    return this.modelId !== null;
  }

  async load(
    config: SttLoadConfig,
    onProgress?: (p: ModelProgressUpdate) => void,
  ): Promise<void> {
    if (this.modelId) await this.unload();

    this.modelId = await loadModel({
      modelSrc: config.modelConstant.src,
      modelType: 'whisper',
      modelConfig: {
        language: config.language,
        strategy: 'greedy',
        n_threads: config.nThreads,
        suppress_blank: true,
        suppress_nst: true,
        // f32le is the raw format we produce in AudioRecorder
        audio_format: 'f32le',
        vad_params: {
          threshold: config.vadThreshold,
          min_speech_duration_ms: config.vadMinSpeechDurationMs,
          min_silence_duration_ms: config.vadMinSilenceDurationMs,
        },
        contextParams: {
          use_gpu: config.useGpu,
        },
      },
      onProgress,
    });
  }

  /**
   * Transcribes a raw f32le PCM Buffer.
   * Yields partial text progressively via onPartial as Whisper processes.
   * Returns the final trimmed text.
   */
  async transcribeBuffer(
    pcmF32le: Buffer,
    onPartial: (text: string) => void,
  ): Promise<string> {
    if (!this.modelId) throw new Error('STT model not loaded');

    let fullText = '';
    for await (const chunk of transcribeStream({
      modelId: this.modelId,
      audioChunk: pcmF32le,
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

export const SttService = new SttServiceClass();
