// ─── TTS Service ─────────────────────────────────────────────────────────────
// Wraps @qvac/sdk TTS (Supertonic 2 ONNX) implementing ITtsService.
// Converts the SDK's Int16 PCM output to Float32Array for AudioPlayer.

import { loadModel, textToSpeech, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';
import { loadWithStallDetection } from '@core/utils/loadWithFallback';
import type { LoadModelArgs } from '@core/utils/loadWithFallback';
import type { IFileSystem } from '@core/ports/IFileSystem';
import type { IAudioPlayer } from '@core/ports/IAudioPlayer';
import type { ITtsService, TtsRuntimeOptions } from './types';

export interface TtsLoadConfig {
  textEncoderSrc: string;
  durationPredictorSrc: string;
  vectorEstimatorSrc: string;
  vocoderSrc: string;
  unicodeIndexerSrc: string;
  ttsConfigSrc: string;
  voiceStyleSrc: string;
  language: 'en' | 'de' | 'es' | 'it';
  speed: number;
  sampleRate: number;
  useGpu: boolean;
  numInferenceSteps?: number;
  supertonicMultilingual?: boolean;
  /**
   * Optional HTTPS fallback sources. When provided and the primary (P2P) load
   * stalls, the SDK is retried with these URLs as `src` strings. Supertonic 2
   * components are standalone .onnx/.json files (no .onnx_data companions), so
   * the SDK's built-in HTTP downloader handles them without the custom
   * companion-resolution logic required by the old Supertonic 1 schema.
   */
  httpFallback?: {
    textEncoderSrc: string;
    durationPredictorSrc: string;
    vectorEstimatorSrc: string;
    vocoderSrc: string;
    unicodeIndexerSrc: string;
    ttsConfigSrc: string;
    voiceStyleSrc: string;
  };
}

class TtsServiceClass implements ITtsService {
  private modelId: string | null = null;
  private _sampleRate = 44100;
  private activePlayer: IAudioPlayer | null = null;

  get isLoaded(): boolean {
    return this.modelId !== null;
  }

  get sampleRate(): number {
    return this._sampleRate;
  }

  async speak(
    text: string,
    audioPlayer: IAudioPlayer,
    _options?: TtsRuntimeOptions,
  ): Promise<void> {
    const pcm = await this.synthesize(text);
    this.activePlayer = audioPlayer;
    audioPlayer.addChunk(pcm, this._sampleRate);
    await audioPlayer.playAndClear();
    this.activePlayer = null;
  }

  async stop(): Promise<void> {
    const p = this.activePlayer;
    this.activePlayer = null;
    if (p) await p.stop().catch(() => {});
  }

  async load(
    config: TtsLoadConfig,
    _deps: { fileSystem: IFileSystem },
    onProgress?: (p: ModelProgressUpdate) => void,
  ): Promise<void> {
    if (this.modelId) await this.unload();

    this._sampleRate = config.sampleRate;

    console.log(
      `[TtsService] load gpu=${config.useGpu} (note: @qvac/sdk TTS uses ONNX Runtime defaults — no explicit GPU delegate is exposed on this SDK surface)`,
    );
    const primary = buildLoadModelArgs(config);

    try {
      this.modelId = await loadWithStallDetection(primary, onProgress);
      return;
    } catch (err) {
      const isStall =
        err instanceof Error && err.message === 'DOWNLOAD_STALLED';
      if (!isStall || !config.httpFallback) throw err;
      console.warn(
        '[TtsService] P2P download stalled, switching to HTTPS fallback',
      );
    }

    const fallbackArgs = buildLoadModelArgs({ ...config, ...config.httpFallback });
    this.modelId = await (loadModel as Function)({
      ...fallbackArgs,
      onProgress,
    });
  }

  // Synthesizes text and returns Float32Array PCM (normalized from Int16 SDK output).
  async synthesize(text: string): Promise<Float32Array> {
    if (!this.modelId) throw new Error('TTS model not loaded');

    const result = textToSpeech({
      modelId: this.modelId,
      text,
      inputType: 'text',
      stream: false,
    });
    const int16Samples = await result.buffer;

    // Convert Int16 samples [-32768, 32767] → Float32 [-1.0, 1.0].
    // Hot path: a 10s clause at 44.1 kHz = ~441k iterations on the JS
    // thread. Avoid `?? 0` (adds a branch per sample; TypedArray indexing
    // already returns 0 for out-of-range) and hoist `length` out of the
    // loop so the JIT keeps it in a register.
    const n = int16Samples.length;
    const float32 = new Float32Array(n);
    const inv = 1 / 32768;
    for (let i = 0; i < n; i++) float32[i] = int16Samples[i]! * inv;
    return float32;
  }

  async unload(): Promise<void> {
    if (!this.modelId) return;
    await unloadModel({ modelId: this.modelId });
    this.modelId = null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLoadModelArgs(config: TtsLoadConfig): LoadModelArgs {
  return {
    modelSrc: config.textEncoderSrc,
    modelType: 'onnx-tts',
    modelConfig: {
      ttsEngine: 'supertonic' as const,
      language: config.language,
      ttsSpeed: config.speed,
      ttsNumInferenceSteps: config.numInferenceSteps ?? 5,
      ttsSupertonicMultilingual: config.supertonicMultilingual ?? true,
      ttsTextEncoderSrc: config.textEncoderSrc,
      ttsDurationPredictorSrc: config.durationPredictorSrc,
      ttsVectorEstimatorSrc: config.vectorEstimatorSrc,
      ttsVocoderSrc: config.vocoderSrc,
      ttsUnicodeIndexerSrc: config.unicodeIndexerSrc,
      ttsTtsConfigSrc: config.ttsConfigSrc,
      ttsVoiceStyleSrc: config.voiceStyleSrc,
    },
  };
}

export const TtsService = new TtsServiceClass();
