// ─── Audio Player ─────────────────────────────────────────────────────────────
// Plays streaming PCM audio from qvac TTS using expo-av.
//
// Strategy: qvac TTS delivers Float32 PCM chunks per clause.
//   1. Collect all chunks for one clause
//   2. Encode as WAV in memory
//   3. Write to a temporary file
//   4. Load & play with expo-av Sound
//   5. Unload and delete the temp file when done
//
// This gives clause-level streaming latency (~1–2s after user stops speaking).

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

const TEMP_DIR_PREFIX = 'tts_';

// ─── WAV encoder ─────────────────────────────────────────────────────────────

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numSamples = samples.length;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);       // chunk size
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert Float32 → Int16
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

// ─── AudioPlayer class ────────────────────────────────────────────────────────

export class AudioPlayer {
  private chunks: Float32Array[] = [];
  private sampleRate = 44100;
  private currentSound: Audio.Sound | null = null;
  private tempUri: string | null = null;
  private stopped = false;

  /** Add a PCM chunk received from the TTS worklet. */
  addChunk(pcm: Float32Array, sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.chunks.push(pcm);
  }

  /** Merge accumulated chunks, encode to WAV, play. Resolves when playback ends. */
  async playAndClear(): Promise<void> {
    if (this.chunks.length === 0) return;

    const merged = this._mergeChunks();
    this.chunks = [];

    const wav = encodeWav(merged, this.sampleRate);
    const b64 = wavToBase64(wav);

    // Write to a temp file
    const tempUri = `${FileSystem.cacheDirectory ?? ''}${TEMP_DIR_PREFIX}${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(tempUri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    this.tempUri = tempUri;

    if (this.stopped) {
      await this._cleanup();
      return;
    }

    // Configure audio mode for speech playback
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: tempUri },
      { shouldPlay: true, volume: 1.0 },
    );
    this.currentSound = sound;

    if (this.stopped) {
      await this._cleanup();
      return;
    }

    // Wait for playback to finish
    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (
          status.isLoaded &&
          (status.didJustFinish || !status.isPlaying)
        ) {
          if (status.didJustFinish) resolve();
        }
        if (!status.isLoaded) resolve();
      });
    });

    await this._cleanup();
  }

  /** Stop any current playback and discard buffered chunks. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.chunks = [];
    await this._cleanup();
  }

  /** Reset for a new utterance. */
  reset(): void {
    this.stopped = false;
    this.chunks = [];
  }

  private async _cleanup(): Promise<void> {
    if (this.currentSound) {
      try {
        await this.currentSound.stopAsync();
        await this.currentSound.unloadAsync();
      } catch {
        // ignore cleanup errors
      }
      this.currentSound = null;
    }
    if (this.tempUri) {
      try {
        await FileSystem.deleteAsync(this.tempUri, { idempotent: true });
      } catch {
        // ignore
      }
      this.tempUri = null;
    }
  }

  private _mergeChunks(): Float32Array {
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
