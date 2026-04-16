// ---- Audio Player Port ---------------------------------------------------
// Platform-agnostic contract for PCM audio playback.
// Mobile: expo-av (WAV file) | Desktop: Web Audio API (direct buffer)

export interface IAudioPlayer {
  /** Queue a PCM chunk for playback. */
  addChunk(pcm: Float32Array, sampleRate: number): void;
  /** Encode queued chunks and play. Resolves when playback ends. */
  playAndClear(): Promise<void>;
  /** Stop any current playback and discard buffered chunks. */
  stop(): Promise<void>;
  /** Reset state for a new utterance. */
  reset(): void;
}
