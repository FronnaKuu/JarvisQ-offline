// ---- Expo Audio Player (Mobile) ------------------------------------------
// Implements IAudioPlayer using expo-av for iOS and Android.
//
// Strategy: qvac TTS delivers Float32 PCM chunks per clause.
//   1. Collect all chunks for one clause
//   2. Encode as WAV in memory
//   3. Write to a temporary file (expo-file-system)
//   4. Load & play with expo-av Sound
//   5. Unload and delete the temp file when done

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import type { IAudioPlayer } from '@core/ports/IAudioPlayer';

const TEMP_PREFIX = 'tts_';

export class ExpoAudioPlayer implements IAudioPlayer {
  private chunks: Float32Array[] = [];
  private sampleRate = 44100;
  private currentSound: Audio.Sound | null = null;
  private tempUri: string | null = null;
  private stopped = false;

  addChunk(pcm: Float32Array, sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.chunks.push(pcm);
  }

  async playAndClear(): Promise<void> {
    if (this.chunks.length === 0) return;

    const merged = this.mergeChunks();
    this.chunks = [];

    const wav = encodeWav(merged, this.sampleRate);
    const b64 = wavToBase64(wav);

    const tempUri = `${FileSystem.cacheDirectory ?? ''}${TEMP_PREFIX}${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(tempUri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    this.tempUri = tempUri;

    if (this.stopped) {
      await this.cleanup();
      return;
    }

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
      await this.cleanup();
      return;
    }

    // Wait for playback to finish.
    // Android (expo-av) can fire isLoaded=false before the sound has started
    // due to an ExoPlayer state race. Guard: only treat isLoaded=false as
    // "finished" after playback has actually started.
    await new Promise<void>((resolve) => {
      let playbackHasStarted = false;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          if (status.isPlaying) playbackHasStarted = true;
          if (status.didJustFinish) {
            resolve();
            return;
          }
          if (playbackHasStarted && !status.isPlaying) {
            resolve();
            return;
          }
        } else {
          if (playbackHasStarted) resolve();
        }
      });
    });

    await this.cleanup();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.chunks = [];
    await this.cleanup();
  }

  reset(): void {
    this.stopped = false;
    this.chunks = [];
  }

  // ---- Private -----------------------------------------------------------

  private async cleanup(): Promise<void> {
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
