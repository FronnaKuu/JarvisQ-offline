// ---- Audio Recorder Port -------------------------------------------------
// Platform-agnostic contract for microphone recording.
// Mobile: expo-av | Desktop: Web Audio API / node microphone

export interface RecordingResult {
  /** File path or URI of the recorded audio. */
  uri: string;
  durationMs: number;
}

export interface AudioRecorderCallbacks {
  onStateChange: (state: AudioRecorderState) => void;
  /** Called on each metering tick with current dBFS amplitude. */
  onAmplitude: (dbFS: number) => void;
}

export type AudioRecorderState = 'idle' | 'recording' | 'stopping';

export interface IAudioRecorder {
  readonly isRecording: boolean;
  /**
   * Starts recording. Resolves with the recorded audio when speech ends
   * (via VAD silence detection or hard timeout).
   * Returns null if cancelled or no speech detected.
   */
  record(): Promise<RecordingResult | null>;
  /** Force-stops an in-progress recording without producing audio. */
  abort(): Promise<void>;
}
