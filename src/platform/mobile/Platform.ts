// ---- Mobile Platform Adapter ---------------------------------------------
// Factory for platform-specific components injected into the pipeline.

import { ExpoAudioRecorder } from './ExpoAudioRecorder';
import { ExpoAudioPlayer } from './ExpoAudioPlayer';
import { LivePcmRecorder } from './LivePcmRecorder';
import type { AudioRecorderCallbacks, IAudioRecorder } from '@core/ports/IAudioRecorder';
import type { IAudioPlayer } from '@core/ports/IAudioPlayer';
import type { LiveRecorderFactory, LiveRecorderHandle } from '@core/pipeline/VoicePipeline';

export const Platform = {
  createAudioRecorder(callbacks: AudioRecorderCallbacks): IAudioRecorder {
    return new ExpoAudioRecorder(callbacks);
  },

  createAudioPlayer(): IAudioPlayer {
    return new ExpoAudioPlayer();
  },

  /**
   * Factory the VoicePipeline uses when dictationMode is on. Wraps
   * react-native-live-audio-stream so the pipeline stays decoupled from
   * the native module.
   */
  createLiveRecorder(): LiveRecorderFactory {
    return async (): Promise<LiveRecorderHandle> => {
      const handle = await LivePcmRecorder.start();
      return {
        chunks: () => handle.chunks(),
        stop: () => handle.stop(),
      };
    };
  },
};
