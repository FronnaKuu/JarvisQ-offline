import { describe, it, expect } from 'vitest';
import { ClauseStreamer } from '../ClauseStreamer';

function streamerCollecting(): { streamer: ClauseStreamer; emitted: string[] } {
  const emitted: string[] = [];
  const streamer = new ClauseStreamer((clause) => emitted.push(clause));
  return { streamer, emitted };
}

describe('ClauseStreamer', () => {
  it('emits at the first hard boundary that satisfies the min-length gate', () => {
    const { streamer, emitted } = streamerCollecting();
    streamer.push('Hello world.');
    expect(emitted).toEqual(['Hello world.']);
  });

  it('does not emit too-short prefixes ending in a hard boundary', () => {
    const { streamer, emitted } = streamerCollecting();
    // "Hi." is 3 chars, well below minHardBoundaryChars=6.
    streamer.push('Hi.');
    expect(emitted).toEqual([]);
    streamer.push(' there everyone.');
    expect(emitted).toEqual(['Hi. there everyone.']);
  });

  it('drains multiple chained sentences from a single push', () => {
    const { streamer, emitted } = streamerCollecting();
    streamer.push('First clause. Second clause is here. ');
    expect(emitted).toEqual(['First clause.', 'Second clause is here.']);
  });

  it('falls back to a soft boundary once the soft min-length is met', () => {
    const { streamer, emitted } = streamerCollecting();
    streamer.push('A long enough leading clause, then more text follows');
    // The comma should fire because the prefix length passes the soft gate
    // (minSoftBoundaryChars=20). No hard boundary present.
    expect(emitted.length).toBe(1);
    expect(emitted[0]?.endsWith(',')).toBe(true);
  });

  it('flush emits any trailing buffered text on stream end', () => {
    const { streamer, emitted } = streamerCollecting();
    streamer.push('No terminator here');
    expect(emitted).toEqual([]);
    streamer.flush();
    expect(emitted).toEqual(['No terminator here']);
  });

  it('reset clears the buffer without emitting', () => {
    const { streamer, emitted } = streamerCollecting();
    streamer.push('Half a thought');
    streamer.reset();
    streamer.flush();
    expect(emitted).toEqual([]);
  });

  it('forces a break at whitespace when the buffer hits maxClauseChars', () => {
    const { streamer, emitted } = streamerCollecting();
    // 250 chars of word-spaced text with no boundary punctuation.
    const long = 'word '.repeat(50).trim();
    streamer.push(long);
    expect(emitted.length).toBe(1);
    // The forced break must keep words intact (no mid-word cut).
    expect(emitted[0]).not.toMatch(/wor$/);
    expect(emitted[0]?.length).toBeGreaterThan(0);
  });
});
