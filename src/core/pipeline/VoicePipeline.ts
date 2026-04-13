// ─── Voice Pipeline ───────────────────────────────────────────────────────────
// Orchestrates STT → LLM → TTS in a continuous loop.
// Architecture mirrors HearoPilot/Jarvis: clause-level TTS streaming with
// producer-consumer parallelism between LLM and TTS.

import { Audio } from 'expo-av';
import { QvacBridge } from '@core/audio/QvacBridge';
import { ClauseStreamer } from './ClauseStreamer';
import { AppConfig } from '@core/config/AppConfig';
import type { PipelinePhase } from '@domain/types';

export interface PipelineCallbacks {
  onPhaseChange: (phase: PipelinePhase) => void;
  onSttPartial: (text: string) => void;
  onSttFinal: (text: string) => void;
  onLlmToken: (token: string) => void;
  onLlmDone: (fullText: string) => void;
  onError: (message: string) => void;
}

export interface PipelineConfig {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  ttsSpeed?: number;
  ttsVoice?: string;
}

const TTS_SAMPLE_RATE = 44100;

export class VoicePipeline {
  private phase: PipelinePhase = 'IDLE';
  private recording: Audio.Recording | null = null;
  private isCancelled = false;
  private callbacks: PipelineCallbacks;
  private config: PipelineConfig;
  private history: Array<{ role: string; content: string }> = [];
  private listenTimer: ReturnType<typeof setTimeout> | null = null;
  private ttsPlaying = false;
  private ttsAborted = false;

  constructor(callbacks: PipelineCallbacks, config: PipelineConfig = {}) {
    this.callbacks = callbacks;
    this.config = config;
  }

  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  clearHistory(): void {
    this.history = [];
  }

  // ─── Public control ──────────────────────────────────────────────────────────

  async startListening(): Promise<void> {
    if (this.phase !== 'IDLE') return;
    this.isCancelled = false;
    this.ttsAborted = false;
    await this._listen();
  }

  stopListening(): void {
    this.isCancelled = true;
    this._stopRecording();
    this._abortTts();
    this._setPhase('IDLE');
  }

  // ─── Phases ───────────────────────────────────────────────────────────────────

  private async _listen(): Promise<void> {
    this._setPhase('LISTENING');
    let finalText = '';
    let timedOut = false;

    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      this.recording = new Audio.Recording();
      await this.recording.prepareToRecordAsync({
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
        },
        ios: {
          extension: '.wav',
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {},
      });

      await this.recording.startAsync();

      // Listen timeout
      this.listenTimer = setTimeout(() => {
        timedOut = true;
        this._stopRecording();
      }, AppConfig.pipeline.listenTimeoutMs);

      // Wait for recording to complete (stopped by VAD or timeout)
      await new Promise<void>((resolve) => {
        this.recording!.setOnRecordingStatusUpdate((status) => {
          if (!status.isRecording && status.isDoneRecording) {
            resolve();
          }
        });
      });
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? err.message : 'Recording failed',
      );
      this._setPhase('IDLE');
      return;
    } finally {
      if (this.listenTimer) clearTimeout(this.listenTimer);
      this.listenTimer = null;
    }

    if (this.isCancelled) return;

    // Get recorded audio
    const uri = this.recording?.getURI();
    this.recording = null;

    if (!uri || timedOut) {
      this._setPhase('IDLE');
      return;
    }

    // Transcribe via worklet
    try {
      this._setPhase('THINKING');

      // Read WAV file and convert to Float32 PCM
      const pcm = await this._readWavAsPcm(uri);

      await QvacBridge.sttTranscribe(
        pcm,
        (text, isFinal) => {
          if (isFinal) {
            finalText = text.trim();
            this.callbacks.onSttFinal(finalText);
          } else {
            this.callbacks.onSttPartial(text);
          }
        },
      );
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? err.message : 'Transcription failed',
      );
      this._setPhase('IDLE');
      return;
    }

    if (this.isCancelled || !finalText) {
      this._setPhase('IDLE');
      return;
    }

    await this._generate(finalText);
  }

  private async _generate(userText: string): Promise<void> {
    this._setPhase('THINKING');

    const messages = [...this.history];
    if (this.config.systemPrompt && messages.length === 0) {
      messages.unshift({ role: 'system', content: this.config.systemPrompt });
    }
    messages.push({ role: 'user', content: userText });

    let fullResponse = '';
    const clauses: string[] = [];
    let ttsReady = false;
    let llmDone = false;

    const streamer = new ClauseStreamer((clause) => {
      clauses.push(clause);
      if (!ttsReady) {
        ttsReady = true;
        this._setPhase('SPEAKING');
      }
      this._playNextClause(clauses, () => {
        // Called when TTS queue is empty
        if (llmDone) {
          this._onSpeakingDone(userText, fullResponse);
        }
      });
    });

    try {
      await QvacBridge.llmGenerate(messages, (token) => {
        if (this.isCancelled) return;
        fullResponse += token;
        this.callbacks.onLlmToken(token);
        streamer.push(token);
      });
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? err.message : 'LLM generation failed',
      );
      this._setPhase('IDLE');
      return;
    }

    // Flush remaining buffer
    streamer.flush();
    llmDone = true;
    this.callbacks.onLlmDone(fullResponse);

    // If nothing was queued for TTS (very short response), speak now
    if (clauses.length === 0 && !this.isCancelled) {
      this._onSpeakingDone(userText, fullResponse);
    }
  }

  private _playNextClause(
    queue: string[],
    onEmpty: () => void,
  ): void {
    if (this.ttsPlaying || this.ttsAborted) return;

    const nextClause = queue.shift();
    if (!nextClause) {
      onEmpty();
      return;
    }

    this.ttsPlaying = true;
    void QvacBridge.ttsSpeak(
      nextClause,
      TTS_SAMPLE_RATE,
      (_pcm, _sampleRate) => {
        // Audio playback via expo-av AudioPlayer is handled here.
        // For now, chunks are received; actual playback wiring is in AudioPlayer.
      },
    )
      .then(() => {
        this.ttsPlaying = false;
        if (!this.ttsAborted) {
          this._playNextClause(queue, onEmpty);
        }
      })
      .catch((err: Error) => {
        this.ttsPlaying = false;
        this.callbacks.onError(`TTS error: ${err.message}`);
      });
  }

  private _onSpeakingDone(userText: string, assistantText: string): void {
    if (this.isCancelled) {
      this._setPhase('IDLE');
      return;
    }
    // Append to history for multi-turn
    this.history.push(
      { role: 'user', content: userText },
      { role: 'assistant', content: assistantText },
    );
    // Truncate history if over maxContextTurns
    const maxTurns = AppConfig.conversation.maxContextTurns;
    if (this.history.length > maxTurns * 2) {
      this.history = this.history.slice(this.history.length - maxTurns * 2);
    }
    // Loop back to LISTENING automatically
    void this._listen();
  }

  private async _stopRecording(): Promise<void> {
    try {
      if (this.recording) {
        await this.recording.stopAndUnloadAsync();
        this.recording = null;
      }
    } catch {
      // ignore errors on stop
    }
  }

  private _abortTts(): void {
    this.ttsAborted = true;
    void QvacBridge.llmCancel().catch(() => {});
  }

  private _setPhase(phase: PipelinePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.callbacks.onPhaseChange(phase);
  }

  // ─── WAV → Float32 helper ────────────────────────────────────────────────────

  private async _readWavAsPcm(uri: string): Promise<Float32Array> {
    // expo-av provides raw PCM data via FileSystem after recording
    const { getInfoAsync, readAsStringAsync, EncodingType } = await import(
      'expo-file-system/legacy'
    );
    const info = await getInfoAsync(uri);
    if (!info.exists) throw new Error('Recording file not found');

    const base64 = await readAsStringAsync(uri, {
      encoding: EncodingType.Base64,
    });
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    // Skip 44-byte WAV header, parse 16-bit PCM
    const pcm16 = new Int16Array(bytes.buffer, 44);
    const pcm32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      pcm32[i] = (pcm16[i] ?? 0) / 32768;
    }
    return pcm32;
  }
}
