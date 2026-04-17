// ─── Desktop Platform Factory ────────────────────────────────────────────────
// Produces the audio adapters the VoicePipeline consumes. On desktop the real
// capture / playback happens in the Electron renderer (Web Audio API); this
// factory returns the main-process IPC proxies that talk to it.
//
// Kept framework-free: it accepts plain `IpcSender` / `IpcReceiver` objects.
// `electron/main.ts` wires them to `BrowserWindow.webContents` and
// `ipcMain.on`.

import type {
  AudioRecorderCallbacks,
  IAudioPlayer,
  IAudioRecorder,
} from '@core/ports';
import { IpcAudioRecorder } from './audio/IpcAudioRecorder';
import type { IpcReceiver, IpcSender } from './audio/IpcAudioRecorder';
import { IpcAudioPlayer } from './audio/IpcAudioPlayer';

export interface DesktopAudioConfig {
  sender: IpcSender;
  receiver: IpcReceiver;
  /** Directory used to persist WAV captures before STT ingests them. */
  cacheDirectory: string;
  /** Target sample rate for STT input (matches AppConfig's STT expectation). */
  targetSampleRate: number;
}

export function createDesktopPlatform(config: DesktopAudioConfig) {
  return {
    createAudioRecorder(callbacks: AudioRecorderCallbacks): IAudioRecorder {
      return new IpcAudioRecorder(callbacks, {
        sender: config.sender,
        receiver: config.receiver,
        cacheDirectory: config.cacheDirectory,
        targetSampleRate: config.targetSampleRate,
      });
    },

    createAudioPlayer(): IAudioPlayer {
      return new IpcAudioPlayer({
        sender: config.sender,
        receiver: config.receiver,
      });
    },
  };
}

export type DesktopPlatform = ReturnType<typeof createDesktopPlatform>;
