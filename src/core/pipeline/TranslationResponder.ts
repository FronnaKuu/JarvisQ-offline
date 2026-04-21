// ─── Translation Responder ───────────────────────────────────────────────────
// Adapts ITranslatorService to the IResponder interface. Stateless: the
// history argument from the pipeline is intentionally ignored — Bergamot
// translates one utterance at a time and carries no conversational context.

import type {
  ConversationMessage,
  IResponder,
  ITranslatorService,
} from '@core/inference/types';

export class TranslationResponder implements IResponder {
  readonly kind = 'translation' as const;

  constructor(private readonly translator: ITranslatorService) {}

  async respond(
    userText: string,
    _history: ConversationMessage[],
    onToken: (token: string) => void,
  ): Promise<string> {
    return this.translator.translate(userText, onToken);
  }

  cancel(): void {
    this.translator.cancel();
  }
}
