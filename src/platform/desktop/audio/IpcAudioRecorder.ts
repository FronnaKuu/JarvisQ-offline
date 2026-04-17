// ─── IPC Audio Recorder (Desktop Main) ───────────────────────────────────────
// Main-process `IAudioRecorder` implementation that drives the renderer-side
// `WebAudioRecorder` through IPC. The renderer owns `getUserMedia`; the main
// process owns the filesystem. This class bridges them:
//
//   1. `record()` sends `recorder:start` with a correlation id and awaits the
//      matching `recorder:result` event (renderer forwards `onAmplitude` and
//      `onStateChange` in the meantime).
//   2. On result, the Float32 PCM buffer is WAV-encoded and written under the
//      desktop cache directory. The resulting `file://` URI is returned so
//      `SttService.transcribe` can ingest it unchanged.
//   3. `abort()` emits `recorder:abort` and ignores the pending reply.
//
// The class is framework-agnostic — it talks through two small IPC primitives
// passed in the constructor, which are fulfilled by `electron/main.ts`.

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type {
  AudioRecorderCallbacks,
  AudioRecorderState,
  IAudioRecorder,
  RecordingResult,
} from '@core/ports/IAudioRecorder';
import { AudioIpcChannels } from './ipcChannels';
import type {
  RecorderAmplitudeEvent,
  RecorderResultPayload,
  RecorderStateEvent,
} from './ipcChannels';
import { encodeWav } from './wavEncoder';

/** Minimal send/subscribe surface; decouples this class from Electron APIs. */
export interface IpcSender {
  send(channel: string, payload: unknown): void;
}

export interface IpcSubscription {
  off(): void;
}

export interface IpcReceiver {
  on(channel: string, handler: (payload: unknown) => void): IpcSubscription;
}

export interface IpcAudioRecorderOptions {
  sender: IpcSender;
  receiver: IpcReceiver;
  /** Absolute directory where WAV captures are written. Must already exist. */
  cacheDirectory: string;
  targetSampleRate: number;
}

export class IpcAudioRecorder implements IAudioRecorder {
  private state: AudioRecorderState = 'idle';
  private activeRequestId: string | null = null;
  private subscriptions: IpcSubscription[] = [];

  private readonly sender: IpcSender;
  private readonly receiver: IpcReceiver;
  private readonly cacheDirectory: string;
  private readonly targetSampleRate: number;
  private readonly callbacks: AudioRecorderCallbacks;

  constructor(callbacks: AudioRecorderCallbacks, options: IpcAudioRecorderOptions) {
    this.callbacks = callbacks;
    this.sender = options.sender;
    this.receiver = options.receiver;
    this.cacheDirectory = options.cacheDirectory;
    this.targetSampleRate = options.targetSampleRate;
  }

  get isRecording(): boolean {
    return this.state === 'recording';
  }

  async record(): Promise<RecordingResult | null> {
    if (this.state !== 'idle') return null;

    const requestId = crypto.randomUUID();
    this.activeRequestId = requestId;

    const resultPromise = new Promise<RecorderResultPayload | null>((resolve) => {
      const stateSub = this.receiver.on(AudioIpcChannels.recorderState, (raw) => {
        const evt = raw as RecorderStateEvent;
        if (evt.requestId !== requestId) return;
        this.setState(evt.state);
      });
      const ampSub = this.receiver.on(AudioIpcChannels.recorderAmplitude, (raw) => {
        const evt = raw as RecorderAmplitudeEvent;
        if (evt.requestId !== requestId) return;
        this.callbacks.onAmplitude(evt.dbFS);
      });
      const resultSub = this.receiver.on(AudioIpcChannels.recorderResult, (raw) => {
        const payload = raw as RecorderResultPayload;
        if (payload.requestId !== requestId) return;
        resolve(payload);
      });
      this.subscriptions = [stateSub, ampSub, resultSub];
    });

    this.sender.send(AudioIpcChannels.recorderStart, {
      requestId,
      targetSampleRate: this.targetSampleRate,
    });

    const payload = await resultPromise;
    this.disposeSubscriptions();
    this.activeRequestId = null;
    this.setState('idle');

    if (!payload || !payload.samples || payload.samples.length === 0) return null;

    const wav = encodeWav(payload.samples, payload.sampleRate);
    const filename = `rec_${Date.now()}_${requestId.slice(0, 8)}.wav`;
    const absPath = path.join(this.cacheDirectory, filename);
    await fs.writeFile(absPath, wav);

    return { uri: pathToFileURL(absPath).toString(), durationMs: payload.durationMs };
  }

  async abort(): Promise<void> {
    if (this.state === 'idle') return;
    if (this.activeRequestId) {
      this.sender.send(AudioIpcChannels.recorderAbort, { requestId: this.activeRequestId });
    }
    this.disposeSubscriptions();
    this.activeRequestId = null;
    this.setState('idle');
  }

  private setState(next: AudioRecorderState): void {
    if (this.state === next) return;
    this.state = next;
    this.callbacks.onStateChange(next);
  }

  private disposeSubscriptions(): void {
    for (const sub of this.subscriptions) {
      try {
        sub.off();
      } catch {
        // ignore
      }
    }
    this.subscriptions = [];
  }
}
