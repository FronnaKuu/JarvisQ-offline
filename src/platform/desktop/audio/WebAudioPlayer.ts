// ─── Web Audio Player (Desktop Renderer) ─────────────────────────────────────
// Implements the renderer half of the desktop TTS playback path. Mirrors
// ExpoAudioPlayer in lifecycle (`addChunk` → buffer, `playAndClear` → play,
// `stop` → abort, `reset` → clear) but plays straight from an in-memory
// AudioBuffer instead of writing a WAV to disk.
//
// Chunks arrive as Float32 PCM (mono) at the engine sample rate and are
// appended to `AudioBuffer` channel data via an AudioBufferSourceNode.

import type { IAudioPlayer } from '@core/ports/IAudioPlayer';

export class WebAudioPlayer implements IAudioPlayer {
  private chunks: Float32Array[] = [];
  private sampleRate = 44_100;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private stopped = false;

  addChunk(pcm: Float32Array, sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.chunks.push(pcm);
  }

  async playAndClear(): Promise<void> {
    if (this.chunks.length === 0) return;

    const merged = this.mergeChunks();
    this.chunks = [];

    if (this.stopped) return;

    const ctx = this.ensureContext();
    const buffer = ctx.createBuffer(1, merged.length, this.sampleRate);
    // `copyToChannel` expects a Float32Array backed by a standard ArrayBuffer.
    // TS sees merged as Float32Array<ArrayBufferLike> (it could in theory be a
    // SharedArrayBuffer), so we copy into the channel's own storage instead.
    buffer.getChannelData(0).set(merged);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    this.currentSource = source;

    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      try {
        source.start();
      } catch {
        resolve();
      }
    });

    this.currentSource = null;
  }

  async drain(): Promise<void> {
    // WebAudio playAndClear already awaits each clause to completion, so
    // there's nothing extra to await here. Satisfies the IAudioPlayer
    // contract the pipeline uses.
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.chunks = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // ignore — source may have already ended
      }
      this.currentSource = null;
    }
  }

  reset(): void {
    this.stopped = false;
    this.chunks = [];
  }

  // ---- Private -----------------------------------------------------------

  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    }
    return this.audioContext;
  }

  private mergeChunks(): Float32Array {
    const totalLength = this.chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }
}
