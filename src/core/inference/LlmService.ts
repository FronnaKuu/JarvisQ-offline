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
  systemPrompt: string;
  useGpu: boolean;
  /** Append /no_think to user messages (Qwen3 and compatible reasoning models). */
  noThink?: boolean;
}

class LlmServiceClass implements ILlmService {
  private modelId: string | null = null;
  private noThink = false;

  get isLoaded(): boolean {
    return this.modelId !== null;
  }

  async load(
    config: LlmLoadConfig,
    onProgress?: (p: ModelProgressUpdate) => void,
    httpFallbackConfig?: LlmLoadConfig,
  ): Promise<void> {
    if (this.modelId) await this.unload();

    this.noThink = config.noThink ?? false;

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
      system_prompt: config.systemPrompt || undefined,
    },
  };
}

export const LlmService = new LlmServiceClass();
