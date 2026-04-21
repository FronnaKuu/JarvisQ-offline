// ─── Translator Service (Bergamot NMT) ───────────────────────────────────────
// Wraps @qvac/sdk translate() for Bergamot neural-MT models. Implements
// ITranslatorService so the pipeline can load a translator the same way it
// loads an LLM — through a shared Responder abstraction.
//
// Bergamot is stateless: each call translates one sentence without history,
// so history is intentionally not threaded through this service.

import { translate, cancel, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';
import { loadWithStallDetection } from '@core/utils/loadWithFallback';
import type { ITranslatorService } from './types';

export interface TranslatorLoadConfig {
  engine: 'bergamot';
  modelConstant: { src: string; modelId: string };
  from: string;
  to: string;
  useGpu: boolean;
}

class TranslatorServiceClass implements ITranslatorService {
  private modelId: string | null = null;
  private currentDirection: { from: string; to: string } | null = null;

  get isLoaded(): boolean {
    return this.modelId !== null;
  }

  get direction(): { from: string; to: string } | null {
    return this.currentDirection;
  }

  async load(
    config: TranslatorLoadConfig,
    onProgress?: (p: ModelProgressUpdate) => void,
  ): Promise<void> {
    if (this.modelId) await this.unload();

    console.log(
      `[TranslatorService] load ${config.from}->${config.to} device=${config.useGpu ? 'gpu' : 'cpu'} model=${config.modelConstant.modelId}`,
    );

    this.modelId = await loadWithStallDetection(
      {
        modelSrc: config.modelConstant.src,
        modelType: 'nmt',
        modelConfig: {
          engine: 'Bergamot',
          from: config.from,
          to: config.to,
          // Bergamot default parameters — proven on the SDK example; exposing
          // them here would be premature configuration.
          beamsize: 1,
          normalize: 1,
          temperature: 0.2,
          norepeatngramsize: 3,
          lengthpenalty: 1.2,
          device: config.useGpu ? 'gpu' : 'cpu',
        },
      },
      onProgress,
    );

    this.currentDirection = { from: config.from, to: config.to };
  }

  async translate(
    text: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    if (!this.modelId) throw new Error('Translator model not loaded');

    const result = translate({
      modelId: this.modelId,
      text,
      modelType: 'nmt',
      stream: true,
    });

    let full = '';
    for await (const token of result.tokenStream) {
      full += token;
      onToken(token);
    }
    return full;
  }

  cancel(): void {
    if (!this.modelId) return;
    void cancel({ operation: 'inference', modelId: this.modelId });
  }

  async unload(): Promise<void> {
    if (!this.modelId) return;
    await unloadModel({ modelId: this.modelId });
    this.modelId = null;
    this.currentDirection = null;
  }
}

export const TranslatorService = new TranslatorServiceClass();
