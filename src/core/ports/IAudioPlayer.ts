// ---- Audio Player Port ---------------------------------------------------
// Platform-agnostic contract for PCM audio playback.
// Mobile: expo-av (WAV file) | Desktop: Web Audio API (direct buffer)

export interface IAudioPlayer {
  /** Queue a PCM chunk for playback. */
  addChunk(pcm: Float32Array, sampleRate: number): void;
  /**
   * Commit the queued chunks as a clause and kick off playback. Resolves
   * as soon as the clause has been chained onto the internal playback
   * pipeline — NOT when playback ends — so the caller can start
   * synthesising the next clause while this one plays. Call `drain()` to
   * await full playback completion.
   */
  playAndClear(): Promise<void>;
  /** Block until every queued clause has finished playing. */
  drain(): Promise<void>;
  /** Stop any current playback and discard buffered chunks. */
  stop(): Promise<void>;
  /** Reset state for a new utterance. */
  reset(): void;
}
