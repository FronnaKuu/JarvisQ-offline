// ─── LLM Responder ───────────────────────────────────────────────────────────
// Adapts ILlmService to the IResponder interface so VoicePipeline stays
// mode-agnostic. Owns the system prompt — callers previously passed it
// through PipelineConfig, but it's really a property of the responder.

import type {
  ConversationMessage,
  ILlmService,
  IResponder,
} from '@core/inference/types';

export interface LlmResponderConfig {
  systemPrompt?: string;
}

export class LlmResponder implements IResponder {
  readonly kind = 'llm' as const;

  constructor(
    private readonly llm: ILlmService,
    private config: LlmResponderConfig = {},
  ) {}

  updateConfig(config: Partial<LlmResponderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async respond(
    userText: string,
    history: ConversationMessage[],
    onToken: (token: string) => void,
  ): Promise<string> {
    const messages: ConversationMessage[] = [];
    if (this.config.systemPrompt) {
      messages.push({ role: 'system', content: this.config.systemPrompt });
    }
    messages.push(...history, { role: 'user', content: userText });
    return this.llm.generate(messages, onToken);
  }

  cancel(): void {
    this.llm.cancelGeneration();
  }
}
