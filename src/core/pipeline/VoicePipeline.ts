// ─── Voice Pipeline ───────────────────────────────────────────────────────────
// Orchestrates STT → LLM → TTS in a continuous loop.
//
// Dependencies are injected via constructor — no direct imports of singletons.
// This makes the pipeline testable with mock services.
//
// STT approach:
//   AudioRecorder uses amplitude-based VAD (expo-av metering) to auto-stop
//   recording after ~900ms of silence. The f32le PCM Buffer is then passed
//   directly to transcribeStream(), which yields tokens progressively.
//   This is as close to real-time as possible without raw frame access.

import { AudioRecorder } from '@core/audio/AudioRecorder';
import { AudioPlayer } from '@core/audio/AudioPlayer';
import { ClauseStreamer } from './ClauseStreamer';
import { AppConfig } from '@core/config/AppConfig';
import type { ISttService, ILlmService, ITtsService, ConversationMessage } from '@core/inference/types';
import type { PipelinePhase } from '@domain/types';

export interface PipelineCallbacks {
  onPhaseChange: (phase: PipelinePhase) => void;
  /** Called during recording with current dBFS amplitude (for waveform UI) */
  onAmplitude: (dbFS: number) => void;
  /** Called with partial STT text during transcription phase */
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

export interface PipelineServices {
  stt: ISttService;
  llm: ILlmService;
  tts: ITtsService;
}

export class VoicePipeline {
  private phase: PipelinePhase = 'IDLE';
  private isCancelled = false;
  private ttsAborted = false;
  private history: ConversationMessage[] = [];

  private readonly recorder: AudioRecorder;
  private readonly audioPlayer: AudioPlayer;
  private readonly stt: ISttService;
  private readonly llm: ILlmService;
  private readonly tts: ITtsService;
  private readonly callbacks: PipelineCallbacks;
  private config: PipelineConfig;

  constructor(
    services: PipelineServices,
    callbacks: PipelineCallbacks,
    config: PipelineConfig = {},
  ) {
    this.stt = services.stt;
    this.llm = services.llm;
    this.tts = services.tts;
    this.callbacks = callbacks;
    this.config = config;

    this.recorder = new AudioRecorder({
      onStateChange: () => { /* state reflected via pipeline phase */ },
      onAmplitude: (db) => callbacks.onAmplitude(db),
    });

    this.audioPlayer = new AudioPlayer();
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

  async stopListening(): Promise<void> {
    this.isCancelled = true;
    await this.recorder.abort();
    this._abortTts();
    this._setPhase('IDLE');
  }

  // ─── Listen phase ─────────────────────────────────────────────────────────────

  private async _listen(): Promise<void> {
    this._setPhase('LISTENING');

    const result = await this.recorder.record();

    if (this.isCancelled) return;

    if (!result) {
      // No speech detected or recording aborted
      this._setPhase('IDLE');
      return;
    }

    await this._transcribe(result.pcmF32le);
  }

  // ─── Transcribe phase ─────────────────────────────────────────────────────────

  private async _transcribe(pcmF32le: Buffer): Promise<void> {
    this._setPhase('THINKING');
    let finalText = '';

    try {
      finalText = await this.stt.transcribeBuffer(pcmF32le, (partial) => {
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

    const messages: ConversationMessage[] =
      this.history.length === 0 && this.config.systemPrompt
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
      await this.llm.generate(messages, (token) => {
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
      const pcm = await this.tts.synthesize(clause);
      if (this.ttsAborted) return;

      this.audioPlayer.addChunk(pcm, this.tts.sampleRate);
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

  private _abortTts(): void {
    this.ttsAborted = true;
    void this.audioPlayer.stop().catch(() => {});
    this.llm.cancelGeneration();
  }

  private _setPhase(phase: PipelinePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.callbacks.onPhaseChange(phase);
  }
}
