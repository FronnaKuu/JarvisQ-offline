// ─── Audio Recorder ───────────────────────────────────────────────────────────
// Records microphone audio with amplitude-based VAD (Voice Activity Detection).
//
// Strategy (expo-av has no raw PCM frame callback):
//   1. Enable metering to get dBFS amplitude every ~100ms via status updates
//   2. Detect speech start  → amplitude > SPEECH_THRESHOLD_DB
//   3. Detect speech end    → amplitude < SILENCE_THRESHOLD_DB for SILENCE_MS
//   4. Auto-stop recording on end-of-speech or hard timeout
//   5. Return the recording URI — the @qvac/sdk server-side decoder handles
//      format conversion (WAV, 3GPP, AAC → f32le PCM) via FFmpegDecoder.
//
// NOTE: On Android, expo-av metering may return null (no hardware support).
// When that happens, amplitude VAD is disabled and the hard timeout fires.
// Whisper's internal Silero VAD then filters out silent recordings.

import { Audio } from 'expo-av';
import { AppConfig } from '@core/config/AppConfig';

export type RecorderState = 'idle' | 'recording' | 'stopping';

export interface RecordingResult {
  /** File URI of the recorded audio — passed directly to transcribeStream(). */
  uri: string;
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

export class AudioRecorder {
  private recording: Audio.Recording | null = null;
  private state: RecorderState = 'idle';
  private callbacks: AudioRecorderCallbacks;
  private listenTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private speechDetected = false;
  /** True once we receive at least one non-null metering value from expo-av.
   *  Some Android devices never return metering (always null); in that case
   *  we fall back to always transcribing and rely on the STT model's VAD. */
  private meteringAvailable = false;
  private stopResolve: ((uri: string | null) => void) | null = null;

  constructor(callbacks: AudioRecorderCallbacks) {
    this.callbacks = callbacks;
  }

  get isRecording(): boolean {
    return this.state === 'recording';
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Starts recording. Returns a Promise that resolves with the recording URI
   * when speech ends (via VAD silence detection or hard timeout).
   * Returns null only if cancelled or if the recording file couldn't be created.
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
    this.meteringAvailable = false;

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

      const rawDb = status.metering;
      if (rawDb !== null && rawDb !== undefined) {
        this.meteringAvailable = true;
      }
      const db = rawDb ?? -160;
      this.callbacks.onAmplitude(db);

      if (db > SPEECH_THRESHOLD_DB && !this.speechDetected) {
        this.speechDetected = true;
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

    const durationMs = Date.now() - startTime;

    // If expo-av metering worked on this device (meteringAvailable = true) but
    // amplitude never crossed speechThresholdDb, there was genuine silence —
    // skip transcription to avoid Whisper hallucinations ("Thank you.", etc.).
    // If metering is unavailable (always null, common on some Android devices),
    // pass the recording to the STT model anyway and rely on its internal VAD.
    if (this.meteringAvailable && !this.speechDetected) {
      return null;
    }

    return { uri, durationMs };
  }

  /** Force-stops an in-progress recording without resolving with audio. */
  async abort(): Promise<void> {
    this._clearTimers();
    if (this.recording) {
      try { await this.recording.stopAndUnloadAsync(); } catch { /* ignore double-stop rejection */ }
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
    } catch {
      // expo-av on Android rejects stopAndUnloadAsync when the native layer
      // double-calls stop() (first stop succeeds, second fails with
      // "stop called in an invalid state: 1"). The recording FILE is already
      // finalized on disk after the first successful stop, so we can still
      // retrieve the URI here.
      uri = this.recording?.getURI() ?? null;
      this.recording = null;
    }

    this.stopResolve?.(uri);
    this.stopResolve = null;
    this._setState('idle');
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
