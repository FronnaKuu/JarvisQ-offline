// ---- Expo Audio Recorder (Mobile) ----------------------------------------
// Implements IAudioRecorder using expo-av for iOS and Android.
//
// Strategy (expo-av has no raw PCM frame callback):
//   1. Enable metering to get dBFS amplitude every ~100ms via status updates
//   2. Detect speech start  -> amplitude > speechThresholdDb
//   3. Detect speech end    -> amplitude < silenceThresholdDb for silenceDurationMs
//   4. Auto-stop recording on end-of-speech or hard timeout
//   5. Return the recording URI -- the @qvac/sdk server-side decoder handles
//      format conversion (WAV, 3GPP, AAC -> f32le PCM) via FFmpegDecoder.
//
// NOTE: On Android, expo-av metering may return null (no hardware support).
// When that happens, amplitude VAD is disabled and the hard timeout fires.
// Whisper's internal Silero VAD then filters out silent recordings.

import { Audio } from 'expo-av';
import { AppConfig } from '@core/config/AppConfig';
import type {
  IAudioRecorder,
  AudioRecorderCallbacks,
  AudioRecorderState,
  RecordingResult,
} from '@core/ports/IAudioRecorder';

const SAMPLE_RATE = 16000;

export class ExpoAudioRecorder implements IAudioRecorder {
  private recording: Audio.Recording | null = null;
  private state: AudioRecorderState = 'idle';
  private readonly callbacks: AudioRecorderCallbacks;
  private listenTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private speechDetected = false;
  private meteringAvailable = false;
  private stopResolve: ((uri: string | null) => void) | null = null;

  private readonly silenceThresholdDb: number;
  private readonly speechThresholdDb: number;
  private readonly silenceDurationMs: number;
  private readonly listenTimeoutMs: number;

  constructor(callbacks: AudioRecorderCallbacks) {
    this.callbacks = callbacks;
    this.silenceThresholdDb = AppConfig.vad.silenceThresholdDb;
    this.speechThresholdDb = AppConfig.vad.speechThresholdDb;
    this.silenceDurationMs = AppConfig.vad.silenceDurationMs;
    this.listenTimeoutMs = AppConfig.pipeline.listenTimeoutMs;
  }

  get isRecording(): boolean {
    return this.state === 'recording';
  }

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

      if (db > this.speechThresholdDb && !this.speechDetected) {
        this.speechDetected = true;
        this.clearSilenceTimer();
      }

      if (this.speechDetected && db < this.silenceThresholdDb) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            void this.stopAndResolve();
          }, this.silenceDurationMs);
        }
      } else if (db >= this.silenceThresholdDb) {
        this.clearSilenceTimer();
      }
    });

    await this.recording.startAsync();
    this.setState('recording');

    this.listenTimer = setTimeout(() => {
      void this.stopAndResolve();
    }, this.listenTimeoutMs);

    const uri = await new Promise<string | null>((resolve) => {
      this.stopResolve = resolve;
    });

    if (!uri) return null;

    const durationMs = Date.now() - startTime;

    // If metering worked but no speech crossed the threshold, skip transcription
    // to avoid Whisper hallucinations ("Thank you.", etc.).
    // If metering is unavailable (common on some Android devices), pass the
    // recording to the STT model and rely on its internal VAD.
    if (this.meteringAvailable && !this.speechDetected) {
      return null;
    }

    return { uri, durationMs };
  }

  async abort(): Promise<void> {
    this.clearTimers();
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch {
        // ignore double-stop rejection
      }
      this.recording = null;
    }
    this.stopResolve?.(null);
    this.stopResolve = null;
    this.setState('idle');
  }

  // ---- Private -----------------------------------------------------------

  private async stopAndResolve(): Promise<void> {
    if (this.state !== 'recording') return;
    this.setState('stopping');
    this.clearTimers();

    let uri: string | null = null;
    try {
      if (this.recording) {
        await this.recording.stopAndUnloadAsync();
        uri = this.recording.getURI() ?? null;
        this.recording = null;
      }
    } catch {
      // expo-av on Android may reject stopAndUnloadAsync when the native layer
      // double-calls stop(). The recording FILE is already finalized on disk.
      uri = this.recording?.getURI() ?? null;
      this.recording = null;
    }

    this.stopResolve?.(uri);
    this.stopResolve = null;
    this.setState('idle');
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
