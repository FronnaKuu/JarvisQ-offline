// ─── Clause Streamer ──────────────────────────────────────────────────────────
// Detects sentence boundaries in a stream of LLM tokens and flushes clauses
// to TTS. Mirrors the producer-consumer pattern from HearoPilot/Jarvis.

import { AppConfig } from '@core/config/AppConfig';

const {
  hardBoundaries,
  softBoundaries,
  minHardBoundaryChars,
  minSoftBoundaryChars,
  maxClauseChars,
} = AppConfig.pipeline;

export class ClauseStreamer {
  private buffer = '';
  private readonly onClause: (clause: string) => void;

  constructor(onClause: (clause: string) => void) {
    this.onClause = onClause;
  }

  push(token: string): void {
    this.buffer += token;
    // Drain every clause whose boundary has now landed inside the buffer —
    // in a single token we can cross multiple sentence ends (e.g. a token
    // like ". The" or "end.\n\nNext"), and previously we only checked the
    // last buffer character so the boundary in the middle was missed.
    while (this.tryFlushBoundary()) {
      // keep going — a single push can yield multiple clauses
    }
    // Safety net: even with no natural boundary, never let the buffer grow
    // past the TTS engine's input ceiling. Force a break at the last
    // whitespace inside the cap so we don't split words.
    if (this.buffer.length >= maxClauseChars) {
      this.forceBreakAtWhitespace();
    }
  }

  /** Flush any remaining buffered text (called when LLM generation ends). */
  flush(): void {
    if (this.buffer.trim().length > 0) {
      this.emit(this.buffer.length);
    }
  }

  reset(): void {
    this.buffer = '';
  }

  // ---- Internals ---------------------------------------------------------

  /**
   * Find the earliest in-buffer boundary that satisfies its min-length gate
   * and emit the prefix up to (and including) it. Returns true on emit so
   * the caller can loop over chained sentences in one token.
   */
  private tryFlushBoundary(): boolean {
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i] ?? '';
      if (hardBoundaries.test(ch)) {
        if (this.buffer.slice(0, i + 1).trim().length >= minHardBoundaryChars) {
          this.emit(i + 1);
          return true;
        }
      }
    }
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i] ?? '';
      if (softBoundaries.test(ch)) {
        if (this.buffer.slice(0, i + 1).trim().length >= minSoftBoundaryChars) {
          this.emit(i + 1);
          return true;
        }
      }
    }
    return false;
  }

  private forceBreakAtWhitespace(): void {
    const limit = Math.min(this.buffer.length, maxClauseChars);
    let cut = -1;
    for (let i = limit - 1; i > 0; i--) {
      if (/\s/.test(this.buffer[i] ?? '')) {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) cut = limit;
    this.emit(cut);
  }

  private emit(cut: number): void {
    const clause = this.buffer.slice(0, cut).trim();
    this.buffer = this.buffer.slice(cut);
    if (clause.length > 0) this.onClause(clause);
  }
}
