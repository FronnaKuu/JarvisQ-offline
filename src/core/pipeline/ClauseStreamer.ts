// ─── Clause Streamer ──────────────────────────────────────────────────────────
// Detects sentence boundaries in a stream of LLM tokens and flushes clauses
// to TTS. Mirrors the producer-consumer pattern from HearoPilot/Jarvis.

import { AppConfig } from '@core/config/AppConfig';

const { hardBoundaries, softBoundaries, minHardBoundaryChars, minSoftBoundaryChars } =
  AppConfig.pipeline;

export class ClauseStreamer {
  private buffer = '';
  private readonly onClause: (clause: string) => void;

  constructor(onClause: (clause: string) => void) {
    this.onClause = onClause;
  }

  push(token: string): void {
    this.buffer += token;

    const lastChar = this.buffer[this.buffer.length - 1] ?? '';

    if (
      hardBoundaries.test(lastChar) &&
      this.buffer.trim().length >= minHardBoundaryChars
    ) {
      this._flush();
    } else if (
      softBoundaries.test(lastChar) &&
      this.buffer.trim().length >= minSoftBoundaryChars
    ) {
      this._flush();
    }
  }

  /** Flush any remaining buffered text (called when LLM generation ends). */
  flush(): void {
    if (this.buffer.trim().length > 0) {
      this._flush();
    }
  }

  reset(): void {
    this.buffer = '';
  }

  private _flush(): void {
    const clause = this.buffer.trim();
    this.buffer = '';
    if (clause.length > 0) {
      this.onClause(clause);
    }
  }
}
