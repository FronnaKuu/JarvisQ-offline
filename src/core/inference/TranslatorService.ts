// ─── Translator Service (Bergamot NMT) ───────────────────────────────────────
// Wraps @qvac/sdk translate() for Bergamot neural-MT models. Implements
// ITranslatorService so the pipeline can load a translator the same way it
// loads an LLM — through a shared Responder abstraction.
//
// Bergamot models are unidirectional and only English is available as a
// pivot; cross-language pairs without a direct model (e.g. it→de) are served
// by loading two legs (it→en, en→de) and chaining them inside translate().
// The pipeline above stays unaware of pivot vs direct.

import { translate, cancel, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';
import { loadWithStallDetection } from '@core/utils/loadWithFallback';
import type { ITranslatorService } from './types';

interface BergamotModelConfig {
  modelConstant: { src: string; modelId: string };
  from: string;
  to: string;
  useGpu: boolean;
}

export type TranslatorLoadConfig =
  | ({ engine: 'bergamot' } & BergamotModelConfig)
  | {
      engine: 'bergamot-pivot';
      leg1: BergamotModelConfig;
      leg2: BergamotModelConfig;
      /** Overall from/to used for direction checks. */
      from: string;
      to: string;
      useGpu: boolean;
    };

class TranslatorServiceClass implements ITranslatorService {
  private legs: string[] = []; // 1 entry for direct, 2 for pivot (leg1, leg2)
  private currentDirection: { from: string; to: string } | null = null;

  get isLoaded(): boolean {
    return this.legs.length > 0;
  }

  get direction(): { from: string; to: string } | null {
    return this.currentDirection;
  }

  async load(
    config: TranslatorLoadConfig,
    onProgress?: (p: ModelProgressUpdate) => void,
  ): Promise<void> {
    if (this.legs.length > 0) await this.unload();

    if (config.engine === 'bergamot') {
      console.log(
        `[TranslatorService] load direct ${config.from}->${config.to} device=${config.useGpu ? 'gpu' : 'cpu'} model=${config.modelConstant.modelId}`,
      );
      const id = await this.loadLeg(config, onProgress);
      this.legs = [id];
    } else {
      console.log(
        `[TranslatorService] load pivot ${config.from}->en->${config.to} device=${config.useGpu ? 'gpu' : 'cpu'}`,
      );
      // Progress callbacks fire separately for each leg; the UI just watches
      // the translator service as a single aggregate — good enough for a
      // rare first-time download.
      const id1 = await this.loadLeg(config.leg1, onProgress);
      const id2 = await this.loadLeg(config.leg2, onProgress);
      this.legs = [id1, id2];
    }

    this.currentDirection = { from: config.from, to: config.to };
  }

  private async loadLeg(
    leg: BergamotModelConfig,
    onProgress?: (p: ModelProgressUpdate) => void,
  ): Promise<string> {
    return loadWithStallDetection(
      {
        modelSrc: leg.modelConstant.src,
        modelType: 'nmt',
        modelConfig: {
          engine: 'Bergamot',
          from: leg.from,
          to: leg.to,
          beamsize: 1,
          normalize: 1,
          temperature: 0.2,
          norepeatngramsize: 3,
          lengthpenalty: 1.2,
          device: leg.useGpu ? 'gpu' : 'cpu',
        },
      },
      onProgress,
    );
  }

  async translate(
    text: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    if (this.legs.length === 0) throw new Error('Translator model not loaded');

    if (this.legs.length === 1) {
      return this.runLeg(this.legs[0]!, text, onToken);
    }

    // Pivot: buffer the first leg to a full sentence (no streaming to UI),
    // then stream the second leg's output to the user. Bergamot emits at
    // sentence granularity anyway, so this adds one hop of latency but no
    // intermediate flicker.
    const intermediate = await this.runLeg(this.legs[0]!, text, () => {});
    return this.runLeg(this.legs[1]!, intermediate, onToken);
  }

  private async runLeg(
    modelId: string,
    text: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    const result = translate({
      modelId,
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
    for (const id of this.legs) {
      void cancel({ operation: 'inference', modelId: id });
    }
  }

  async unload(): Promise<void> {
    const ids = this.legs;
    this.legs = [];
    this.currentDirection = null;
    for (const id of ids) {
      await unloadModel({ modelId: id });
    }
  }
}

export const TranslatorService = new TranslatorServiceClass();
