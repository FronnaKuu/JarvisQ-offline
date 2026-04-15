// ─── Voice Pipeline ───────────────────────────────────────────────────────────
// Orchestrates STT → LLM → TTS in a continuous loop.
// Uses @qvac/sdk inference services directly — no custom worklet or IPC bridge.
// Clause-level TTS streaming mirrors HearoPilot/Jarvis latency strategy.

import { Audio } from 'expo-av';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';
import { AudioPlayer } from '@core/audio/AudioPlayer';
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
}

export class VoicePipeline {
  private phase: PipelinePhase = 'IDLE';
  private recording: Audio.Recording | null = null;
  private isCancelled = false;
  private callbacks: PipelineCallbacks;
  private config: PipelineConfig;
  private history: Array<{ role: string; content: string }> = [];
  private listenTimer: ReturnType<typeof setTimeout> | null = null;
  private ttsAborted = false;
  private readonly audioPlayer = new AudioPlayer();

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
    void this._stopRecording();
    this._abortTts();
    this._setPhase('IDLE');
  }

  // ─── Listen phase ─────────────────────────────────────────────────────────────

  private async _listen(): Promise<void> {
    this._setPhase('LISTENING');

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

      this.listenTimer = setTimeout(() => {
        void this._stopRecording();
      }, AppConfig.pipeline.listenTimeoutMs);

      // Wait for recording to finish (timeout triggers stopAndUnload above)
      await new Promise<void>((resolve) => {
        this.recording!.setOnRecordingStatusUpdate((status) => {
          if (!status.isRecording && status.isDoneRecording) resolve();
        });
      });
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? err.message : 'Recording failed',
      );
      this._setPhase('IDLE');
      return;
    } finally {
      if (this.listenTimer) {
        clearTimeout(this.listenTimer);
        this.listenTimer = null;
      }
    }

    if (this.isCancelled) return;

    const uri = this.recording?.getURI() ?? null;
    this.recording = null;
    if (!uri) {
      this._setPhase('IDLE');
      return;
    }

    await this._transcribe(uri);
  }

  // ─── Transcribe phase ─────────────────────────────────────────────────────────

  private async _transcribe(audioUri: string): Promise<void> {
    this._setPhase('THINKING');
    let finalText = '';

    try {
      // Pass the WAV file URI directly — the SDK handles decoding internally.
      finalText = await SttService.transcribe(audioUri, (partial) => {
        if (!this.isCancelled) this.callbacks.onSttPartial(partial);
      });
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

    this.callbacks.onSttFinal(finalText);
    await this._generate(finalText);
  }

  // ─── Generate phase ───────────────────────────────────────────────────────────

  private async _generate(userText: string): Promise<void> {
    this._setPhase('THINKING');

    const messages = this.history.length === 0 && this.config.systemPrompt
      ? [{ role: 'system', content: this.config.systemPrompt }, ...this.history]
      : [...this.history];
    messages.push({ role: 'user', content: userText });

    let fullResponse = '';
    let llmDone = false;
    const clauses: string[] = [];
    let ttsStarted = false;

    const onQueueEmpty = () => {
      if (llmDone) this._onSpeakingDone(userText, fullResponse);
    };

    const streamer = new ClauseStreamer((clause) => {
      clauses.push(clause);
      if (!ttsStarted) {
        ttsStarted = true;
        this._setPhase('SPEAKING');
      }
      void this._drainTtsQueue(clauses, onQueueEmpty);
    });

    try {
      await LlmService.generate(messages, (token) => {
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

    streamer.flush();
    llmDone = true;
    this.callbacks.onLlmDone(fullResponse);

    if (clauses.length === 0 && !this.isCancelled) {
      this._onSpeakingDone(userText, fullResponse);
    }
  }

  // ─── TTS queue ────────────────────────────────────────────────────────────────

  private async _drainTtsQueue(
    queue: string[],
    onEmpty: () => void,
  ): Promise<void> {
    if (this.ttsAborted) return;

    const clause = queue.shift();
    if (!clause) {
      onEmpty();
      return;
    }

    try {
      const pcm = await TtsService.synthesize(clause);
      if (this.ttsAborted) return;

      this.audioPlayer.addChunk(pcm, TtsService.sampleRate);
      await this.audioPlayer.playAndClear();

      if (!this.ttsAborted) {
        await this._drainTtsQueue(queue, onEmpty);
      }
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? `TTS error: ${err.message}` : 'TTS failed',
      );
    }
  }

  // ─── Loop back ────────────────────────────────────────────────────────────────

  private _onSpeakingDone(userText: string, assistantText: string): void {
    if (this.isCancelled) {
      this._setPhase('IDLE');
      return;
    }

    this.history.push(
      { role: 'user', content: userText },
      { role: 'assistant', content: assistantText },
    );

    const maxTurns = AppConfig.conversation.maxContextTurns;
    if (this.history.length > maxTurns * 2) {
      this.history = this.history.slice(this.history.length - maxTurns * 2);
    }

    void this._listen();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

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
    void this.audioPlayer.stop().catch(() => {});
    LlmService.cancelGeneration();
  }

  private _setPhase(phase: PipelinePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.callbacks.onPhaseChange(phase);
  }
}
