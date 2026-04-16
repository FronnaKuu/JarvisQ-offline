// ---- Mobile Platform Adapter ---------------------------------------------
// Factory for platform-specific components injected into the pipeline.

import { ExpoAudioRecorder } from './ExpoAudioRecorder';
import { ExpoAudioPlayer } from './ExpoAudioPlayer';
import type { AudioRecorderCallbacks, IAudioRecorder } from '@core/ports/IAudioRecorder';
import type { IAudioPlayer } from '@core/ports/IAudioPlayer';

export const Platform = {
  createAudioRecorder(callbacks: AudioRecorderCallbacks): IAudioRecorder {
    return new ExpoAudioRecorder(callbacks);
  },

  createAudioPlayer(): IAudioPlayer {
    return new ExpoAudioPlayer();
  },
};
