// ─── Web Audio Recorder (Desktop Renderer) ───────────────────────────────────
// Implements the renderer half of the desktop microphone capture path.
//
// Strategy:
//   1. `getUserMedia({ audio: ... })` to obtain a live MediaStream.
//   2. An `AudioWorkletNode` pulls Float32 mono frames and forwards them via
//      `MessagePort` to the main-thread class instance.
//   3. Incoming frames are:
//        - Downsampled to `AppConfig` target sample rate (16 kHz) with a
//          simple low-pass + decimator. Whisper / Parakeet expect 16 kHz.
//        - Converted to dBFS for VAD (speech-start / silence-stop) — semantics
//          mirror `ExpoAudioRecorder` so the same `AppConfig.vad.*` thresholds
//          are reused without branching.
//        - Appended to an in-memory buffer until stop.
//   4. Stop is triggered by silence-after-speech, hard timeout, or explicit
//      abort(). The buffer is returned to the caller; the main process writes
//      it to a WAV on disk and feeds that URI to the STT service.
//
// The class is renderer-only; the main process talks to it through
// `RendererAudioBridge` via IPC.

import { AppConfig } from '@core/config/AppConfig';
import type {
  IAudioRecorder,
  AudioRecorderCallbacks,
  AudioRecorderState,
  RecordingResult,
} from '@core/ports/IAudioRecorder';

const TARGET_SAMPLE_RATE = 16_000;
const WORKLET_NAME = 'jarvis-pcm-capture';

export interface WebAudioRecorderCapture {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
  speechDetected: boolean;
  meteringAvailable: boolean;
}

/**
 * Renderer-side recorder. Unlike the mobile adapter it does not produce a
 * file URI — it resolves with the raw PCM buffer so the caller (the IPC
 * bridge) can decide where to persist it. The `IAudioRecorder` contract is
 * therefore satisfied by `captureToResult()`; `record()` is only implemented
 * to keep the port-level signature compatible for future direct uses.
 */
export class WebAudioRecorder implements IAudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private state: AudioRecorderState = 'idle';
  private readonly callbacks: AudioRecorderCallbacks;

  private chunks: Float32Array[] = [];
  private totalSamples = 0;
  private speechDetected = false;
  private meteringAvailable = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private listenTimer: ReturnType<typeof setTimeout> | null = null;
  private stopResolve: ((result: WebAudioRecorderCapture | null) => void) | null = null;
  private startTime = 0;

  private readonly speechThresholdDb: number;
  private readonly silenceThresholdDb: number;
  private readonly silenceDurationMs: number;
  private readonly listenTimeoutMs: number;

  constructor(callbacks: AudioRecorderCallbacks) {
    this.callbacks = callbacks;
    this.speechThresholdDb = AppConfig.vad.speechThresholdDb;
    this.silenceThresholdDb = AppConfig.vad.silenceThresholdDb;
    this.silenceDurationMs = AppConfig.vad.silenceDurationMs;
    this.listenTimeoutMs = AppConfig.pipeline.listenTimeoutMs;
  }

  get isRecording(): boolean {
    return this.state === 'recording';
  }

  // IAudioRecorder — port compatibility shim. The desktop app uses
  // captureToResult() directly since the caller needs raw PCM for IPC.
  async record(): Promise<RecordingResult | null> {
    const capture = await this.captureToResult();
    if (!capture) return null;
    // No file persistence on the renderer side; return a dummy URI. The
    // bridge replaces this with a real file:// URI before the pipeline sees it.
    return { uri: '', durationMs: capture.durationMs };
  }

  async captureToResult(): Promise<WebAudioRecorderCapture | null> {
    if (this.state !== 'idle') return null;

    this.chunks = [];
    this.totalSamples = 0;
    this.speechDetected = false;
    this.meteringAvailable = false;
    this.startTime = performance.now();

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContext();
    await this.audioContext.audioWorklet.addModule(buildWorkletObjectUrl());
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, WORKLET_NAME);
    this.workletNode.port.onmessage = (event) => {
      const frame = event.data as Float32Array;
      this.handleFrame(frame, this.audioContext!.sampleRate);
    };
    this.sourceNode.connect(this.workletNode);
    // Do not connect the worklet to destination — we are not monitoring.

    this.setState('recording');

    this.listenTimer = setTimeout(() => {
      void this.finalize();
    }, this.listenTimeoutMs);

    return await new Promise<WebAudioRecorderCapture | null>((resolve) => {
      this.stopResolve = resolve;
    });
  }

  async abort(): Promise<void> {
    if (this.state === 'idle') return;
    this.clearTimers();
    await this.teardownGraph();
    this.stopResolve?.(null);
    this.stopResolve = null;
    this.setState('idle');
  }

  // ---- Private -----------------------------------------------------------

  private handleFrame(frame: Float32Array, sourceSampleRate: number): void {
    if (this.state !== 'recording') return;

    const downsampled =
      sourceSampleRate === TARGET_SAMPLE_RATE
        ? frame
        : downsample(frame, sourceSampleRate, TARGET_SAMPLE_RATE);

    this.chunks.push(downsampled);
    this.totalSamples += downsampled.length;

    const db = computeDbFs(downsampled);
    this.meteringAvailable = true;
    this.callbacks.onAmplitude(db);

    if (db > this.speechThresholdDb && !this.speechDetected) {
      this.speechDetected = true;
      this.clearSilenceTimer();
    }

    if (this.speechDetected && db < this.silenceThresholdDb) {
      if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          void this.finalize();
        }, this.silenceDurationMs);
      }
    } else if (db >= this.silenceThresholdDb) {
      this.clearSilenceTimer();
    }
  }

  private async finalize(): Promise<void> {
    if (this.state !== 'recording') return;
    this.setState('stopping');
    this.clearTimers();
    await this.teardownGraph();

    const durationMs = performance.now() - this.startTime;
    const merged = mergeChunks(this.chunks, this.totalSamples);
    this.chunks = [];
    this.totalSamples = 0;

    const result: WebAudioRecorderCapture | null =
      this.meteringAvailable && !this.speechDetected
        ? null
        : {
            samples: merged,
            sampleRate: TARGET_SAMPLE_RATE,
            durationMs,
            speechDetected: this.speechDetected,
            meteringAvailable: this.meteringAvailable,
          };

    this.stopResolve?.(result);
    this.stopResolve = null;
    this.setState('idle');
  }

  private async teardownGraph(): Promise<void> {
    try {
      this.workletNode?.port.close();
      this.workletNode?.disconnect();
      this.sourceNode?.disconnect();
    } catch {
      // best-effort cleanup
    }
    this.workletNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) track.stop();
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch {
        // ignore
      }
    }
    this.audioContext = null;
  }

  private setState(state: AudioRecorderState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearSilenceTimer();
    if (this.listenTimer) {
      clearTimeout(this.listenTimer);
      this.listenTimer = null;
    }
  }
}

// ---- Helpers --------------------------------------------------------------

function mergeChunks(chunks: Float32Array[], totalLength: number): Float32Array {
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function computeDbFs(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  if (rms <= 0) return -160;
  return Math.max(-160, 20 * Math.log10(rms));
}

function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate >= fromRate) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outLength);
  // Simple average over each window — avoids bringing a DSP library and is
  // sufficient for 16 kHz ASR targets given 48 kHz → 16 kHz (ratio 3).
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    let n = 0;
    for (let j = start; j < end && j < input.length; j++) {
      sum += input[j] ?? 0;
      n++;
    }
    output[i] = n > 0 ? sum / n : 0;
  }
  return output;
}

// AudioWorklet source injected as a Blob URL so the adapter is a single file
// with no extra asset to package. Emits 128-sample Float32 frames (the worklet
// quantum) as plain `Float32Array` messages — the main-thread class buffers
// them. Copying inside the worklet is required because AudioWorklet reuses
// the same backing store across callbacks.
const WORKLET_SOURCE = `
class JarvisPcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', JarvisPcmCapture);
`;

let cachedWorkletUrl: string | null = null;

function buildWorkletObjectUrl(): string {
  if (cachedWorkletUrl) return cachedWorkletUrl;
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  cachedWorkletUrl = URL.createObjectURL(blob);
  return cachedWorkletUrl;
}
