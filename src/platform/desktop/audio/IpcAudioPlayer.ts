// ─── IPC Audio Player (Desktop Main) ─────────────────────────────────────────
// Main-process `IAudioPlayer` that forwards queued PCM chunks to the renderer,
// then asks it to play. Chunks are buffered in main memory first and streamed
// in a single IPC message on `playAndClear()` — mirrors ExpoAudioPlayer's
// "collect-then-play" lifecycle so VoicePipeline semantics are identical.
//
// Uses the same `IpcSender` / `IpcReceiver` abstractions as `IpcAudioRecorder`
// to stay framework-free.

import * as crypto from 'node:crypto';
import type { IAudioPlayer } from '@core/ports/IAudioPlayer';
import { AudioIpcChannels } from './ipcChannels';
import type {
  IpcReceiver,
  IpcSender,
  IpcSubscription,
} from './IpcAudioRecorder';
import type { PlayerDoneEvent } from './ipcChannels';

export interface IpcAudioPlayerOptions {
  sender: IpcSender;
  receiver: IpcReceiver;
}

export class IpcAudioPlayer implements IAudioPlayer {
  private readonly sender: IpcSender;
  private readonly receiver: IpcReceiver;

  private chunks: Float32Array[] = [];
  private sampleRate = 44_100;
  private currentUtteranceId: string | null = null;
  private stopped = false;
  private pendingSub: IpcSubscription | null = null;

  constructor(options: IpcAudioPlayerOptions) {
    this.sender = options.sender;
    this.receiver = options.receiver;
  }

  addChunk(pcm: Float32Array, sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.chunks.push(pcm);
  }

  async playAndClear(): Promise<void> {
    if (this.chunks.length === 0) return;
    if (this.stopped) {
      this.chunks = [];
      return;
    }

    const utteranceId = crypto.randomUUID();
    this.currentUtteranceId = utteranceId;

    // Stream chunks first so the renderer can start feeding the audio graph.
    for (const samples of this.chunks) {
      this.sender.send(AudioIpcChannels.playerAddChunk, {
        utteranceId,
        samples,
        sampleRate: this.sampleRate,
      });
    }
    this.chunks = [];

    const donePromise = new Promise<void>((resolve) => {
      const sub = this.receiver.on(AudioIpcChannels.playerPlaybackDone, (raw) => {
        const evt = raw as PlayerDoneEvent;
        if (evt.utteranceId !== utteranceId) return;
        sub.off();
        this.pendingSub = null;
        resolve();
      });
      this.pendingSub = sub;
    });

    this.sender.send(AudioIpcChannels.playerPlayAndClear, { utteranceId });
    await donePromise;

    if (this.currentUtteranceId === utteranceId) {
      this.currentUtteranceId = null;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.chunks = [];
    this.sender.send(AudioIpcChannels.playerStop, {});
    if (this.pendingSub) {
      try {
        this.pendingSub.off();
      } catch {
        // ignore
      }
      this.pendingSub = null;
    }
    this.currentUtteranceId = null;
  }

  reset(): void {
    this.stopped = false;
    this.chunks = [];
    this.sender.send(AudioIpcChannels.playerReset, {});
  }
}
