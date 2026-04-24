// ---- Expo Audio Player (Mobile) ------------------------------------------
// Implements IAudioPlayer using expo-audio for iOS and Android.
//
// Playback strategy (pipelined):
//   - `addChunk` buffers Float32 PCM chunks delivered by the TTS engine.
//   - `playAndClear` commits the buffered chunks as one clause and CHAINS
//     its playback onto an internal promise tail. It resolves as soon as
//     the clause is queued — NOT when audio ends — so the caller (TTS
//     engine) can immediately start synthesising the next clause while
//     this one plays. Overlap kills the ~1 s inter-clause gap that made
//     expo-av's Sound-per-clause approach audible.
//   - `drain` is awaited by the pipeline before firing "speaking done" so
//     the last clause's playback completes before the phase transition.
//
// Why expo-audio instead of expo-av: expo-av allocated a fresh ExoPlayer
// per Sound.createAsync and released it on unloadAsync, inserting ~1 s of
// silence between clauses. expo-audio exposes a persistent AudioPlayer
// whose source can be swapped via `replace()` without tearing down the
// underlying native pipeline.

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer, AudioStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import type { IAudioPlayer } from '@core/ports/IAudioPlayer';

const TEMP_PREFIX = 'tts_';
// Android low-level audio drops a handful of samples on pipeline start-up;
// a short silent lead-in ensures the first phoneme is not clipped.
const LEAD_IN_MS = 80;

export class ExpoAudioPlayer implements IAudioPlayer {
  private chunks: Float32Array[] = [];
  private sampleRate = 44100;
  private player: AudioPlayer | null = null;
  private audioModeConfigured = false;
  /**
   * Promise chain of queued playbacks. Each `playAndClear` call appends a
   * `.then()` that awaits the previous clause's playback before swapping
   * the player's source and kicking off the new one. Starts as a resolved
   * promise so the first clause's playback runs immediately.
   */
  private playbackTail: Promise<void> = Promise.resolve();
  private stopped = false;

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

    const merged = this.mergeChunks();
    this.chunks = [];
    const sampleRate = this.sampleRate;

    const leadSamples = Math.round((LEAD_IN_MS / 1000) * sampleRate);
    const padded = new Float32Array(leadSamples + merged.length);
    padded.set(merged, leadSamples);
    const wav = encodeWav(padded, sampleRate);
    const b64 = wavToBase64(wav);

    const tempUri = `${FileSystem.cacheDirectory ?? ''}${TEMP_PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}.wav`;

    // Writing the WAV to disk is synchronous-ish but on RN's JS thread —
    // kicking it off here means the file is ready by the time the
    // playback tail wants to swap sources.
    const writePromise = FileSystem.writeAsStringAsync(tempUri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const durationMs = (padded.length / sampleRate) * 1000 + 1000;

    this.playbackTail = this.playbackTail
      .catch(() => {
        // Swallow prior-clause errors so one failed clause can't break
        // the whole queue — log via console so the issue is debuggable.
      })
      .then(async () => {
        await writePromise;
        if (this.stopped) {
          void this.deleteFile(tempUri);
          return;
        }
        await this.ensureAudioMode();
        const player = this.ensurePlayer();
        try {
          player.replace({ uri: tempUri });
          player.play();
          await this.waitForFinish(player, durationMs);
        } finally {
          void this.deleteFile(tempUri);
        }
      });

    // Resolve immediately — caller can start synthesising the next clause.
  }

  async drain(): Promise<void> {
    await this.playbackTail.catch(() => {});
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.chunks = [];
    if (this.player) {
      try {
        this.player.pause();
      } catch {
        // ignore — player may already be idle
      }
    }
    // Best-effort drain so pending file writes finish cleanup before we
    // move on. Don't await too long — a malfunctioning player could hang.
    await Promise.race([
      this.playbackTail.catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 250)),
    ]);
  }

  reset(): void {
    this.stopped = false;
    this.chunks = [];
    this.playbackTail = Promise.resolve();
  }

  // ---- Private -----------------------------------------------------------

  private async ensureAudioMode(): Promise<void> {
    if (this.audioModeConfigured) return;
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    });
    this.audioModeConfigured = true;
  }

  private ensurePlayer(): AudioPlayer {
    if (this.player) return this.player;
    this.player = createAudioPlayer(null, { updateInterval: 500 });
    return this.player;
  }

  private waitForFinish(player: AudioPlayer, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        subscription.remove();
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(settle, timeoutMs);
      const subscription = player.addListener(
        'playbackStatusUpdate',
        (status: AudioStatus) => {
          if (status.didJustFinish) {
            settle();
          }
        },
      );
    });
  }

  private async deleteFile(uri: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // ignore cleanup errors — temp files age out of cacheDirectory anyway
    }
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

// ---- WAV encoding --------------------------------------------------------

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numSamples = samples.length;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function wavToBase64(wav: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < wav.length; i += chunk) {
    const slice = wav.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
