// ---- Expo Audio Player (Mobile) ------------------------------------------
// Implements IAudioPlayer using expo-audio for iOS and Android.
//
// Strategy: qvac TTS delivers Float32 PCM chunks per clause.
//   1. Collect all chunks for one clause
//   2. Encode as WAV in memory, write to a temp file
//   3. Feed the file to a single long-lived AudioPlayer via replace()
//   4. Wait for didJustFinish, then fire-and-forget cleanup of the WAV
//
// Why expo-audio instead of expo-av: expo-av allocates a fresh ExoPlayer +
// AudioTrack per Sound.createAsync and releases it on unloadAsync — the
// re-init cycle inserts ~1s of silence between clauses (audible stutter).
// expo-audio exposes a persistent AudioPlayer whose source can be swapped
// via replace() without tearing down the underlying native pipeline.

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
  private pendingTempUri: string | null = null;
  private stopped = false;

  addChunk(pcm: Float32Array, sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.chunks.push(pcm);
  }

  async playAndClear(): Promise<void> {
    if (this.chunks.length === 0) return;

    const merged = this.mergeChunks();
    this.chunks = [];

    const leadSamples = Math.round((LEAD_IN_MS / 1000) * this.sampleRate);
    const padded = new Float32Array(leadSamples + merged.length);
    padded.set(merged, leadSamples);
    const wav = encodeWav(padded, this.sampleRate);
    const b64 = wavToBase64(wav);

    const tempUri = `${FileSystem.cacheDirectory ?? ''}${TEMP_PREFIX}${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(tempUri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (this.stopped) {
      void this.deleteFile(tempUri);
      return;
    }

    await this.ensureAudioMode();
    const player = this.ensurePlayer();

    // Swap source without destroying the native pipeline — this is the
    // difference from expo-av Sound.createAsync/unloadAsync.
    player.replace({ uri: tempUri });

    // Cleanup previous clause's file now that the player has moved on.
    const previousUri = this.pendingTempUri;
    this.pendingTempUri = tempUri;
    if (previousUri) {
      void this.deleteFile(previousUri);
    }

    if (this.stopped) {
      return;
    }

    player.play();

    // Wait for didJustFinish. Safety net: hard timeout of clipDuration + 1s
    // so a missed event doesn't deadlock the drain.
    const durationMs = (padded.length / this.sampleRate) * 1000 + 1000;
    await this.waitForFinish(player, durationMs);
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
    if (this.pendingTempUri) {
      const uri = this.pendingTempUri;
      this.pendingTempUri = null;
      void this.deleteFile(uri);
    }
  }

  reset(): void {
    this.stopped = false;
    this.chunks = [];
  }

  // ---- Private -----------------------------------------------------------

  private async ensureAudioMode(): Promise<void> {
    if (this.audioModeConfigured) return;
    // Called once per player lifetime — expo-av equivalent was invoked per
    // clause, triggering setMode/setSpeakerphoneOn every playback.
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    });
    this.audioModeConfigured = true;
  }

  private ensurePlayer(): AudioPlayer {
    if (this.player) return this.player;
    // Null source is allowed; replace() supplies the first clip.
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
