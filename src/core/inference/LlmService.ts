// ─── LLM Service ─────────────────────────────────────────────────────────────
// Wraps @qvac/sdk LLM completion (llama.cpp) with load/generate/cancel/unload.
// Streams tokens via callback for low-latency UI updates.

import { loadModel, completion, cancel, unloadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';

export interface LlmLoadConfig {
  modelConstant: { src: string; modelId: string };
  contextSize: number;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  useGpu: boolean;
}

export type ConversationMessage = { role: string; content: string };

class LlmServiceClass {
  private modelId: string | null = null;

  get isLoaded(): boolean {
    return this.modelId !== null;
  }

  async load(
    config: LlmLoadConfig,
    onProgress?: (p: ModelProgressUpdate) => void,
  ): Promise<void> {
    if (this.modelId) await this.unload();

    this.modelId = await loadModel({
      modelSrc: config.modelConstant.src,
      modelType: 'llm',
      modelConfig: {
        ctx_size: config.contextSize,
        temp: config.temperature,
        predict: config.maxTokens,
        device: config.useGpu ? 'gpu' : 'cpu',
        system_prompt: config.systemPrompt || undefined,
      },
      onProgress,
    });
  }

  // Generates a completion and streams tokens via onToken.
  // Returns the full response text.
  async generate(
    history: ConversationMessage[],
    onToken: (token: string) => void,
  ): Promise<string> {
    if (!this.modelId) throw new Error('LLM model not loaded');

    const result = completion({
      modelId: this.modelId,
      history,
      stream: true,
    });

    let fullText = '';
    for await (const token of result.tokenStream) {
      fullText += token;
      onToken(token);
    }
    return fullText;
  }

  // Cancels the current in-flight generation.
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

export const LlmService = new LlmServiceClass();
