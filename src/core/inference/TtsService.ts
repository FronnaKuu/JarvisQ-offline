// ─── TTS Service ─────────────────────────────────────────────────────────────
// Wraps @qvac/sdk TTS (Supertonic ONNX) implementing ITtsService.
// Converts the SDK's Int16 PCM output to Float32Array for AudioPlayer.

import { loadModel, textToSpeech, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';
import { loadWithStallDetection } from '@core/utils/loadWithFallback';
import type { LoadModelArgs } from '@core/utils/loadWithFallback';
import {
  downloadTtsWithCompanions,
  type TtsCompanionSources,
  type TtsLocalPaths,
} from '@core/utils/downloadTtsWithCompanions';
import type { IFileSystem } from '@core/ports/IFileSystem';
import type { ITtsService } from './types';

export interface TtsLoadConfig {
  tokenizerSrc: string;
  textEncoderSrc: string;
  latentDenoiserSrc: string;
  voiceDecoderSrc: string;
  voiceSrc: string;
  language: 'en' | 'de' | 'es' | 'it';
  speed: number;
  sampleRate: number;
  useGpu: boolean;
  /**
   * Optional HTTP fallback sources including .onnx_data companion files.
   * When provided and the primary load stalls, all files (including companions)
   * are downloaded to a dedicated directory with original filenames, then
   * passed to loadModel as local paths. Required for Supertonic TTS HTTP
   * fallback because the SDK's default HTTP downloader strips filenames via
   * hash prefixing, breaking ONNX Runtime's companion file resolution.
   */
  httpCompanionSources?: TtsCompanionSources;
}

class TtsServiceClass implements ITtsService {
  private modelId: string | null = null;
  private _sampleRate = 44100;

  get isLoaded(): boolean {
    return this.modelId !== null;
  }

  get sampleRate(): number {
    return this._sampleRate;
  }

  async load(
    config: TtsLoadConfig,
    deps: { fileSystem: IFileSystem },
    onProgress?: (p: ModelProgressUpdate) => void,
  ): Promise<void> {
    if (this.modelId) await this.unload();

    this._sampleRate = config.sampleRate;

    const primary = buildLoadModelArgs(config);

    try {
      this.modelId = await loadWithStallDetection(primary, onProgress);
      return;
    } catch (err) {
      const isStall =
        err instanceof Error && err.message === 'DOWNLOAD_STALLED';
      if (!isStall || !config.httpCompanionSources) throw err;
      console.warn(
        '[TtsService] P2P download stalled, switching to HTTPS companion fallback',
      );
    }

    // HTTP fallback: pre-download .onnx + .onnx_data companions with original
    // filenames so ONNX Runtime can resolve them, then pass local paths.
    const localPaths = await downloadTtsWithCompanions(
      deps.fileSystem,
      config.httpCompanionSources,
      onProgress,
    );
    const fallbackArgs = buildLoadModelArgs({
      ...config,
      ...localPathsToConfig(localPaths),
    });
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

    // Convert Int16 samples [-32768, 32767] → Float32 [-1.0, 1.0]
    const float32 = new Float32Array(int16Samples.length);
    for (let i = 0; i < int16Samples.length; i++) {
      float32[i] = (int16Samples[i] ?? 0) / 32768;
    }
    return float32;
  }

  async unload(): Promise<void> {
    if (!this.modelId) return;
    await unloadModel({ modelId: this.modelId });
    this.modelId = null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localPathsToConfig(p: TtsLocalPaths): Partial<TtsLoadConfig> {
  return {
    tokenizerSrc: p.tokenizerPath,
    textEncoderSrc: p.textEncoderPath,
    latentDenoiserSrc: p.latentDenoiserPath,
    voiceDecoderSrc: p.voiceDecoderPath,
    voiceSrc: p.voiceStylePath,
  };
}

function buildLoadModelArgs(config: TtsLoadConfig): LoadModelArgs {
  return {
    modelSrc: config.tokenizerSrc,
    modelType: 'tts',
    modelConfig: {
      ttsEngine: 'supertonic' as const,
      language: config.language,
      ttsSpeed: config.speed,
      ttsTokenizerSrc: config.tokenizerSrc,
      ttsTextEncoderSrc: config.textEncoderSrc,
      ttsLatentDenoiserSrc: config.latentDenoiserSrc,
      ttsVoiceDecoderSrc: config.voiceDecoderSrc,
      ttsVoiceSrc: config.voiceSrc,
    },
  };
}

export const TtsService = new TtsServiceClass();
