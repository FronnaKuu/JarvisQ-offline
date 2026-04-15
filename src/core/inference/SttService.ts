// ─── STT Service ─────────────────────────────────────────────────────────────
// Wraps @qvac/sdk speech-to-text (Whisper) with load/transcribe/unload lifecycle.
// Accepts a WAV file path from expo-av and streams partial text via callback.

import { loadModel, transcribeStream, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';

export interface SttLoadConfig {
  modelConstant: { src: string; modelId: string };
  language: string;
  nThreads: number;
  vadThreshold: number;
  vadMinSpeechDurationMs: number;
  vadMinSilenceDurationMs: number;
  useGpu: boolean;
}

class SttServiceClass {
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

  // Transcribes a WAV file and streams partial text via onPartial.
  // Returns the final complete text.
  async transcribe(
    audioFilePath: string,
    onPartial: (text: string) => void,
  ): Promise<string> {
    if (!this.modelId) throw new Error('STT model not loaded');
    let fullText = '';
    for await (const chunk of transcribeStream({
      modelId: this.modelId,
      audioChunk: audioFilePath,
    })) {
      fullText += chunk;
      onPartial(fullText.trim());
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
