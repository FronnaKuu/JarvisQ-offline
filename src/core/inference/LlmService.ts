// ─── LLM Service ─────────────────────────────────────────────────────────────
// Wraps @qvac/sdk completion (llama.cpp) implementing ILlmService.
// Streams tokens via callback for low-latency UI updates.

import { loadModel, completion, cancel, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';
import { loadModelWithFallback } from '@core/utils/loadWithFallback';
import type { LoadModelArgs } from '@core/utils/loadWithFallback';
import type { ILlmService, ConversationMessage } from './types';

export interface LlmLoadConfig {
  modelConstant: { src: string; modelId: string };
  contextSize: number;
  temperature: number;
  maxTokens: number;
  useGpu: boolean;
  /** Append /no_think to user messages (Qwen3 and compatible reasoning models). */
  noThink?: boolean;
  /**
   * Offline-first hint. When true the loader skips the HTTP fallback (and the
   * P2P discovery path it would trigger) and loads straight from the on-disk
   * model cache. Set automatically by AppBootstrap on repeat launches once
   * models are known to be downloaded; the call fails fast if the blob is
   * missing so the caller can retry with network enabled.
   */
  offline?: boolean;
}

class LlmServiceClass implements ILlmService {
  private modelId: string | null = null;
  private noThink = false;
  private loadingPromise: Promise<void> | null = null;

  get isLoaded(): boolean {
    return this.modelId !== null;
  }

  async load(
    config: LlmLoadConfig,
    onProgress?: (p: ModelProgressUpdate) => void,
    httpFallbackConfig?: LlmLoadConfig,
  ): Promise<void> {
    // Coalesce concurrent callers (mode-picker + chat screen mount both invoke
    // ensureResponderReady before the first load resolves) onto a single
    // loadModel RPC.
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = this.doLoad(config, onProgress, httpFallbackConfig);
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoad(
    config: LlmLoadConfig,
    onProgress?: (p: ModelProgressUpdate) => void,
    httpFallbackConfig?: LlmLoadConfig,
  ): Promise<void> {
    if (this.modelId) await this.unload();

    this.noThink = config.noThink ?? false;

    console.log(
      `[LlmService] load device=${config.useGpu ? 'gpu' : 'cpu'} model=${config.modelConstant.modelId} mode=${config.offline ? 'cache-only' : 'network-ok'}`,
    );
    const primary = buildLoadModelArgs(config);
    const fallback = !config.offline && httpFallbackConfig
      ? buildLoadModelArgs(httpFallbackConfig)
      : undefined;

    if (fallback) {
      this.modelId = await loadModelWithFallback({
        primary,
        httpFallback: fallback,
        onProgress,
      });
    } else {
      // Local-first path: the SDK resolves from its on-disk cache with zero
      // network traffic when the blob is already downloaded. Also used when
      // the caller explicitly requested offline (config.offline === true).
      this.modelId = await (loadModel as Function)({ ...primary, onProgress });
    }
  }

  async generate(
    history: ConversationMessage[],
    onToken: (token: string) => void,
  ): Promise<string> {
    if (!this.modelId) throw new Error('LLM model not loaded');

    // For Qwen3 and compatible reasoning models: append /no_think to the last
    // user message so the model skips the internal chain-of-thought and responds
    // directly. This is the standard llama.cpp mechanism — no regex filtering needed.
    // The model may still emit empty <think></think> wrapper tokens; those are
    // stripped below. The @qvac/sdk does not expose llama.cpp's reasoning_format
    // parameter, so tag filtering is the only reliable option on this SDK surface.
    const messages = this.noThink ? this._appendNoThink(history) : history;

    const result = completion({
      modelId: this.modelId,
      history: messages,
      stream: true,
    });

    let raw = '';
    let emitted = 0;

    for await (const token of result.tokenStream) {
      raw += token;
      const filtered = this._stripThink(raw);
      const delta = filtered.slice(emitted);
      if (delta) {
        emitted = filtered.length;
        onToken(delta);
      }
    }

    return this._stripThink(raw).trim();
  }

  private _appendNoThink(history: ConversationMessage[]): ConversationMessage[] {
    if (history.length === 0) return history;
    const last = history[history.length - 1];
    if (last?.role !== 'user') return history;
    return [
      ...history.slice(0, -1),
      { ...last, content: `${last.content} /no_think` },
    ];
  }

  /**
   * Strip <think>…</think> blocks (complete or still-open at streaming boundary)
   * and remove any leading whitespace that would otherwise appear as blank space
   * at the top of the chat bubble.
   */
  private _stripThink(text: string): string {
    let r = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    r = r.replace(/<think>[\s\S]*$/, '');
    return r.replace(/^\s+/, '');
  }

  cancelGeneration(): void {
    if (!this.modelId) return;
    void cancel({ operation: 'inference', modelId: this.modelId });
  }

  async unload(): Promise<void> {
    if (!this.modelId) return;
    await unloadModel({ modelId: this.modelId });
    this.modelId = null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLoadModelArgs(config: LlmLoadConfig): LoadModelArgs {
  return {
    modelSrc: config.modelConstant.src,
    modelType: 'llm',
    modelConfig: {
      ctx_size: config.contextSize,
      temp: config.temperature,
      predict: config.maxTokens,
      device: config.useGpu ? 'gpu' : 'cpu',
    },
  };
}

export const LlmService = new LlmServiceClass();
