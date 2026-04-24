// ---- Live PCM Recorder (Mobile) ------------------------------------------
// Emits 16 kHz mono s16le PCM chunks in real-time so callers can feed the
// @qvac/sdk transcribeStream duplex session (VAD-driven simulated streaming
// in the parakeet native addon).
//
// Backed by react-native-live-audio-stream (Android AudioRecord + iOS
// AVAudioEngine) which pushes base64-encoded PCM frames via an event.
// expo-audio's recorder has no equivalent live-sampling hook, so this is
// the smallest viable dependency.

import AudioRecord from 'react-native-live-audio-stream';
import { Buffer } from 'buffer';

const SAMPLE_RATE = 16000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;
// MediaRecorder.AudioSource.VOICE_RECOGNITION — AEC/NS off, raw mic feed.
const ANDROID_AUDIO_SOURCE = 6;
// Pick a bufferSize around 200 ms: 16000 samples/s * 0.2s * 2 bytes = 6400.
// Smaller = lower latency but more event overhead; 6400 bytes is a good
// trade-off that lets Silero VAD (512-sample windows = 32 ms) process
// incoming audio without starvation.
const BUFFER_SIZE_BYTES = 6400;

export interface LivePcmRecorderHandle {
  /** PCM chunks as they arrive from the mic. Yields until stop() is called. */
  chunks(): AsyncIterable<Uint8Array>;
  stop(): Promise<void>;
}

export class LivePcmRecorder {
  /**
   * Starts the microphone and returns a handle whose `chunks()` AsyncIterable
   * yields PCM buffers until `stop()` is called. `stop()` drains the stream
   * gracefully (any buffered chunks are delivered before the iterator ends).
   */
  static async start(): Promise<LivePcmRecorderHandle> {
    AudioRecord.init({
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
      audioSource: ANDROID_AUDIO_SOURCE,
      bufferSize: BUFFER_SIZE_BYTES,
      // react-native-live-audio-stream writes each capture to a WAV on disk
      // regardless of whether we consume it. Point at a throwaway file; we
      // only care about the `data` stream.
      wavFile: `live-pcm-${Date.now()}.wav`,
    });

    const queue: Uint8Array[] = [];
    const waiters: Array<(b: Uint8Array | null) => void> = [];
    let stopped = false;

    // AudioRecord.on internally calls EventEmitter.addListener and returns
    // the subscription, but the shipped .d.ts mis-annotates the return as
    // void — cast to get the real handle so stop() can unsubscribe.
    const subscription = (AudioRecord as unknown as {
      on: (ev: 'data', cb: (d: string) => void) => { remove(): void };
    }).on('data', (base64: string) => {
      if (stopped) return;
      const chunk = new Uint8Array(Buffer.from(base64, 'base64'));
      const waiter = waiters.shift();
      if (waiter) waiter(chunk);
      else queue.push(chunk);
    });

    AudioRecord.start();

    async function* generateChunks(): AsyncGenerator<Uint8Array> {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift() as Uint8Array;
          continue;
        }
        if (stopped) return;
        const chunk = await new Promise<Uint8Array | null>((resolve) => {
          waiters.push(resolve);
        });
        if (chunk === null) return;
        yield chunk;
      }
    }

    const stop = async (): Promise<void> => {
      if (stopped) return;
      stopped = true;
      try {
        await AudioRecord.stop();
      } catch {
        // ignore — native may complain if already stopped
      }
      // Unsubscribe from the data stream so late events don't queue indefinitely.
      subscription?.remove?.();
      // Wake any pending waiter so the AsyncIterable can terminate cleanly.
      while (waiters.length > 0) {
        const w = waiters.shift();
        w?.(null);
      }
    };

    return { chunks: generateChunks, stop };
  }
}
