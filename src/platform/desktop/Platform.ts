// ─── Desktop Platform Factory ────────────────────────────────────────────────
// Mirrors `src/platform/mobile/Platform.ts`: produces the audio adapters the
// VoicePipeline needs. The concrete recorder / player classes are shell-
// specific (Electron / Tauri / Pear) — see `./audio/README.md`. Until a shell
// is selected, the factory throws with a clear message so attempts to run the
// app on desktop fail fast instead of silently.

import type {
  AudioRecorderCallbacks,
  IAudioPlayer,
  IAudioRecorder,
} from '@core/ports';

const NOT_IMPLEMENTED =
  'Desktop audio adapter not implemented. Pick an audio backend under ' +
  'src/platform/desktop/audio/ (see README) and wire it here.';

export const Platform = {
  createAudioRecorder(_callbacks: AudioRecorderCallbacks): IAudioRecorder {
    throw new Error(NOT_IMPLEMENTED);
  },

  createAudioPlayer(): IAudioPlayer {
    throw new Error(NOT_IMPLEMENTED);
  },
};
