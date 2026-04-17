// ─── Desktop Audio IPC Channels ──────────────────────────────────────────────
// Shared channel names + payload shapes used by both sides of the Electron IPC
// bridge for microphone capture (renderer → main) and TTS PCM playback
// (main → renderer). Kept in one file so main, preload and renderer cannot
// drift apart.

export const AudioIpcChannels = {
  // Recorder: main drives lifecycle on the renderer
  recorderStart: 'audio:recorder:start',
  recorderAbort: 'audio:recorder:abort',
  // Recorder: renderer pushes events back to main
  recorderState: 'audio:recorder:state',
  recorderAmplitude: 'audio:recorder:amplitude',
  recorderResult: 'audio:recorder:result',

  // Player: main pushes PCM + lifecycle commands to renderer
  playerAddChunk: 'audio:player:add-chunk',
  playerPlayAndClear: 'audio:player:play-and-clear',
  playerStop: 'audio:player:stop',
  playerReset: 'audio:player:reset',
  // Player: renderer signals playback completion
  playerPlaybackDone: 'audio:player:playback-done',
} as const;

export interface RecorderStartRequest {
  /** Correlation id — each record() call emits a fresh id so stale replies are ignored. */
  requestId: string;
  targetSampleRate: number;
}

export interface RecorderAmplitudeEvent {
  requestId: string;
  dbFS: number;
}

export interface RecorderStateEvent {
  requestId: string;
  state: 'idle' | 'recording' | 'stopping';
}

export interface RecorderResultPayload {
  requestId: string;
  /** Mono Float32 PCM, already at `sampleRate`. `null` when aborted / no speech. */
  samples: Float32Array | null;
  sampleRate: number;
  durationMs: number;
  speechDetected: boolean;
  meteringAvailable: boolean;
}

export interface PlayerChunkPayload {
  /** Monotonic id for the current utterance — lets stale chunks be dropped after stop(). */
  utteranceId: string;
  samples: Float32Array;
  sampleRate: number;
}

export interface PlayerPlayRequest {
  utteranceId: string;
}

export interface PlayerDoneEvent {
  utteranceId: string;
}
