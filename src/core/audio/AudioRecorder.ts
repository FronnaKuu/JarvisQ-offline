// ─── Audio Recorder ───────────────────────────────────────────────────────────
// Records microphone audio with amplitude-based VAD (Voice Activity Detection).
//
// Strategy (expo-av has no raw PCM frame callback):
//   1. Enable metering to get dBFS amplitude every ~100ms via status updates
//   2. Detect speech start  → amplitude > SPEECH_THRESHOLD_DB
//   3. Detect speech end    → amplitude < SILENCE_THRESHOLD_DB for SILENCE_MS
//   4. Auto-stop recording on end-of-speech or hard timeout
//   5. Read the WAV file and return raw f32le PCM Buffer for transcription
//
// The f32le Buffer format is what @qvac/sdk transcribeStream expects.

import { Audio } from 'expo-av';
import * as LegacyFS from 'expo-file-system/legacy';
import { AppConfig } from '@core/config/AppConfig';

export type RecorderState = 'idle' | 'recording' | 'stopping';

export interface RecordingResult {
  /** Raw f32le PCM Buffer at 16kHz mono — ready for transcribeStream() */
  pcmF32le: Buffer;
  durationMs: number;
}

export interface AudioRecorderCallbacks {
  onStateChange: (state: RecorderState) => void;
  /** Called on each status tick with current dBFS amplitude */
  onAmplitude: (dbFS: number) => void;
}

const SAMPLE_RATE = 16000;
const SILENCE_THRESHOLD_DB = AppConfig.vad.silenceThresholdDb;
const SPEECH_THRESHOLD_DB = AppConfig.vad.speechThresholdDb;
const SILENCE_DURATION_MS = AppConfig.vad.silenceDurationMs;
const LISTEN_TIMEOUT_MS = AppConfig.pipeline.listenTimeoutMs;
const MIN_SPEECH_DURATION_MS = AppConfig.vad.minSpeechDurationMs;

export class AudioRecorder {
  private recording: Audio.Recording | null = null;
  private state: RecorderState = 'idle';
  private callbacks: AudioRecorderCallbacks;
  private listenTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private speechDetected = false;
  private speechStartMs = 0;
  private stopResolve: ((uri: string | null) => void) | null = null;

  constructor(callbacks: AudioRecorderCallbacks) {
    this.callbacks = callbacks;
  }

  get isRecording(): boolean {
    return this.state === 'recording';
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Starts recording. Returns a Promise that resolves with the raw f32le PCM Buffer
   * when speech ends (via VAD silence detection or hard timeout).
   * Returns null if cancelled or no speech detected.
   */
  async record(): Promise<RecordingResult | null> {
    if (this.state !== 'idle') return null;

    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    this.recording = new Audio.Recording();
    this.speechDetected = false;
    this.speechStartMs = 0;

    await this.recording.prepareToRecordAsync({
      android: {
        extension: '.wav',
        outputFormat: Audio.AndroidOutputFormat.DEFAULT,
        audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
        sampleRate: SAMPLE_RATE,
        numberOfChannels: 1,
        bitRate: 256000,
      },
      ios: {
        extension: '.wav',
        outputFormat: Audio.IOSOutputFormat.LINEARPCM,
        audioQuality: Audio.IOSAudioQuality.MAX,
        sampleRate: SAMPLE_RATE,
        numberOfChannels: 1,
        bitRate: 256000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {},
      isMeteringEnabled: true,
    });

    const startTime = Date.now();

    this.recording.setOnRecordingStatusUpdate((status) => {
      if (!status.isRecording) return;

      const db = status.metering ?? -160;
      this.callbacks.onAmplitude(db);

      if (db > SPEECH_THRESHOLD_DB && !this.speechDetected) {
        this.speechDetected = true;
        this.speechStartMs = Date.now() - startTime;
        // Cancel any pending silence timer
        this._clearSilenceTimer();
      }

      if (this.speechDetected && db < SILENCE_THRESHOLD_DB) {
        // Start silence countdown if not already running
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            void this._stopAndResolve();
          }, SILENCE_DURATION_MS);
        }
      } else if (db >= SILENCE_THRESHOLD_DB) {
        // Sound returned — cancel silence countdown
        this._clearSilenceTimer();
      }
    });

    await this.recording.startAsync();
    this._setState('recording');

    // Hard timeout
    this.listenTimer = setTimeout(() => {
      void this._stopAndResolve();
    }, LISTEN_TIMEOUT_MS);

    // Wait for recording to finish
    const uri = await new Promise<string | null>((resolve) => {
      this.stopResolve = resolve;
    });

    if (!uri) return null;

    const speechDurationMs = this.speechDetected
      ? (Date.now() - startTime - this.speechStartMs)
      : 0;

    if (!this.speechDetected || speechDurationMs < MIN_SPEECH_DURATION_MS) {
      return null;
    }

    try {
      const pcmF32le = await this._readWavAsF32le(uri);
      return { pcmF32le, durationMs: speechDurationMs };
    } catch {
      return null;
    }
  }

  /** Force-stops an in-progress recording without resolving with audio. */
  async abort(): Promise<void> {
    this._clearTimers();
    if (this.recording) {
      try { await this.recording.stopAndUnloadAsync(); } catch { /* ignore */ }
      this.recording = null;
    }
    this.stopResolve?.(null);
    this.stopResolve = null;
    this._setState('idle');
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async _stopAndResolve(): Promise<void> {
    if (this.state !== 'recording') return;
    this._setState('stopping');
    this._clearTimers();

    let uri: string | null = null;
    try {
      if (this.recording) {
        await this.recording.stopAndUnloadAsync();
        uri = this.recording.getURI() ?? null;
        this.recording = null;
      }
    } catch { /* ignore */ }

    this.stopResolve?.(uri);
    this.stopResolve = null;
    this._setState('idle');
  }

  private async _readWavAsF32le(uri: string): Promise<Buffer> {
    const info = await LegacyFS.getInfoAsync(uri);
    if (!info.exists) throw new Error('Recording file not found');

    const b64 = await LegacyFS.readAsStringAsync(uri, {
      encoding: LegacyFS.EncodingType.Base64,
    });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // Skip 44-byte WAV header → raw Int16 PCM @ 16kHz mono
    const int16 = new Int16Array(bytes.buffer, 44);

    // Convert Int16 → f32le (what Whisper expects)
    const float32Arr = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32Arr[i] = (int16[i] ?? 0) / 32768;
    }

    return Buffer.from(float32Arr.buffer);
  }

  private _setState(state: RecorderState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  private _clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private _clearTimers(): void {
    this._clearSilenceTimer();
    if (this.listenTimer) {
      clearTimeout(this.listenTimer);
      this.listenTimer = null;
    }
  }
}
