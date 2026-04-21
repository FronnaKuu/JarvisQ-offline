// ---- Expo Audio Recorder (Mobile) ----------------------------------------
// Implements IAudioRecorder using expo-av for iOS and Android.
//
// Audio format:
//   - Android: MPEG-4 container + AAC encoder at 16 kHz mono. The previous
//     DEFAULT/DEFAULT combo let MediaRecorder pick AMR-NB at 8 kHz, which
//     destroys half the spectrum before the STT model ever sees it. AAC 16 kHz
//     is loss-tolerant but preserves the voice band the STT was trained on.
//   - iOS: 16-bit linear PCM WAV at 16 kHz mono (already correct).
// Both formats are decoded to f32le PCM server-side by the @qvac/sdk
// FFmpegDecoder before reaching the model.
//
// Strategy (expo-av has no raw PCM frame callback):
//   1. Enable metering to get dBFS amplitude every ~100ms via status updates
//   2. Detect speech start  -> amplitude > speechThresholdDb
//   3. Detect speech end    -> amplitude < silenceThresholdDb for silenceDurationMs
//   4. Auto-stop recording on end-of-speech or hard timeout
//   5. Return the recording URI -- the @qvac/sdk server-side decoder handles
//      format conversion (WAV, M4A, AAC -> f32le PCM) via FFmpegDecoder.
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
  private preRollDeadline = 0;
  private lastStatusTs = 0;
  private cumulativeSpeechMs = 0;
  private peakDb = -160;

  private readonly silenceThresholdDb: number;
  private readonly speechThresholdDb: number;
  private readonly silenceDurationMs: number;
  private readonly minSpeechDurationMs: number;
  private readonly speechPeakThresholdDb: number;
  private readonly listenTimeoutMs: number;
  private readonly preRollMs: number;
  private readonly androidBitrate: number;

  constructor(callbacks: AudioRecorderCallbacks) {
    this.callbacks = callbacks;
    this.silenceThresholdDb = AppConfig.vad.silenceThresholdDb;
    this.speechThresholdDb = AppConfig.vad.speechThresholdDb;
    this.silenceDurationMs = AppConfig.vad.silenceDurationMs;
    this.minSpeechDurationMs = AppConfig.vad.minSpeechDurationMs;
    this.speechPeakThresholdDb =
      AppConfig.vad.speechThresholdDb + AppConfig.vad.peakMarginDb;
    this.listenTimeoutMs = AppConfig.pipeline.listenTimeoutMs;
    this.preRollMs = AppConfig.recording.preRollMs;
    this.androidBitrate = AppConfig.recording.androidBitrate;
  }

  get isRecording(): boolean {
    return this.state === 'recording';
  }

  async record(): Promise<RecordingResult | null> {
    if (this.state !== 'idle') return null;

    await Audio.requestPermissionsAsync();
    // Audio mode is set once at bootstrap (bootstrapMobile) with
    // allowsRecordingIOS=true. Not flipping it per record() call avoids
    // Android audio-focus churn (setMode / setSpeakerphoneOn in logs) that
    // correlates with first-word cuts on the following TTS clause.

    this.recording = new Audio.Recording();
    this.speechDetected = false;
    this.meteringAvailable = false;
    this.cumulativeSpeechMs = 0;
    this.peakDb = -160;
    this.lastStatusTs = 0;

    await this.recording.prepareToRecordAsync({
      android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: SAMPLE_RATE,
        numberOfChannels: 1,
        bitRate: this.androidBitrate,
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
    this.preRollDeadline = startTime + this.preRollMs;

    this.recording.setOnRecordingStatusUpdate((status) => {
      if (!status.isRecording) return;

      // Ignore metering/VAD during the pre-roll window: the initial frames
      // get discarded by the server-side AAC decoder, and any amplitude here
      // does not correspond to audio the model will ever see.
      const now = Date.now();
      if (now < this.preRollDeadline) {
        this.lastStatusTs = now;
        return;
      }

      const rawDb = status.metering;
      if (rawDb !== null && rawDb !== undefined) {
        this.meteringAvailable = true;
      }
      const db = rawDb ?? -160;
      this.callbacks.onAmplitude(db);

      // Accumulate above-threshold time between consecutive status updates
      // (expo-av ticks at ~100 ms). Speech is "detected" only when both the
      // sustained-time and peak-amplitude gates pass; this filters out brief
      // transients like the TTS tail echoed back through the speaker.
      const dtMs = this.lastStatusTs === 0 ? 0 : now - this.lastStatusTs;
      this.lastStatusTs = now;

      if (db > this.speechThresholdDb) {
        this.cumulativeSpeechMs += dtMs;
        if (db > this.peakDb) this.peakDb = db;
      }

      if (
        !this.speechDetected &&
        this.cumulativeSpeechMs >= this.minSpeechDurationMs &&
        this.peakDb >= this.speechPeakThresholdDb
      ) {
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
    }, this.listenTimeoutMs + this.preRollMs);

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
