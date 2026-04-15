// ─── TTS Service ─────────────────────────────────────────────────────────────
// Wraps @qvac/sdk TTS (Supertonic ONNX) implementing ITtsService.
// Converts the SDK's Int16 PCM output to Float32Array for AudioPlayer.

import { loadModel, textToSpeech, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';
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
    onProgress?: (p: ModelProgressUpdate) => void,
  ): Promise<void> {
    if (this.modelId) await this.unload();

    this._sampleRate = config.sampleRate;

    this.modelId = await loadModel({
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

export const TtsService = new TtsServiceClass();
