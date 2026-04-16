// ---- Voice Pipeline ------------------------------------------------------
// Orchestrates STT -> LLM -> TTS in a continuous loop.
//
// Audio I/O is injected via constructor (IAudioRecorder / IAudioPlayer)
// because it genuinely differs between mobile and desktop platforms.
// Everything else uses direct imports -- no unnecessary abstraction.

import { ClauseStreamer } from './ClauseStreamer';
import { AppConfig } from '@core/config/AppConfig';
import { captureSnapshot, logLlmStart, logLlmDone } from '@core/utils/PerfLogger';
import type { IAudioRecorder } from '@core/ports/IAudioRecorder';
import type { IAudioPlayer } from '@core/ports/IAudioPlayer';
import type { ISttService, ILlmService, ITtsService, ConversationMessage } from '@core/inference/types';
import type { PipelinePhase } from '@domain/types';

export interface PipelineCallbacks {
  onPhaseChange: (phase: PipelinePhase) => void;
  onAmplitude: (dbFS: number) => void;
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

export interface PipelineDeps {
  services: PipelineServices;
  recorder: IAudioRecorder;
  audioPlayer: IAudioPlayer;
}

export class VoicePipeline {
  private phase: PipelinePhase = 'IDLE';
  private isCancelled = false;
  private ttsAborted = false;
  private isDraining = false;
  private history: ConversationMessage[] = [];

  private readonly recorder: IAudioRecorder;
  private readonly audioPlayer: IAudioPlayer;
  private readonly stt: ISttService;
  private readonly llm: ILlmService;
  private readonly tts: ITtsService;
  private readonly callbacks: PipelineCallbacks;
  private config: PipelineConfig;

  constructor(
    deps: PipelineDeps,
    callbacks: PipelineCallbacks,
    config: PipelineConfig = {},
  ) {
    this.stt = deps.services.stt;
    this.llm = deps.services.llm;
    this.tts = deps.services.tts;
    this.recorder = deps.recorder;
    this.audioPlayer = deps.audioPlayer;
    this.callbacks = callbacks;
    this.config = config;
  }

  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  clearHistory(): void {
    this.history = [];
  }

  // ---- Public control ----------------------------------------------------

  async startListening(): Promise<void> {
    if (this.phase !== 'IDLE') return;
    this.isCancelled = false;
    this.ttsAborted = false;
    await this.listen();
  }

  async stopListening(): Promise<void> {
    this.isCancelled = true;
    await this.recorder.abort();
    this.abortTts();
    this.setPhase('IDLE');
  }

  /**
   * Barge-in: interrupt ongoing TTS playback (and the LLM generation feeding
   * it) and return to IDLE without discarding conversation history. Safe to
   * call from any phase; no-op when already IDLE or LISTENING.
   */
  async interrupt(): Promise<void> {
    if (this.phase === 'IDLE' || this.phase === 'LISTENING') return;
    this.isCancelled = true;
    this.abortTts();
    this.setPhase('IDLE');
  }

  /**
   * Text fallback: feeds the LLM directly with a typed user message, bypassing
   * STT. Mirrors the post-transcription path (emit SttFinal so the UI persists
   * the user turn, then stream the response through TTS). No-op when busy.
   */
  async sendText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (this.phase !== 'IDLE') return;

    this.isCancelled = false;
    this.ttsAborted = false;
    this.callbacks.onSttFinal(trimmed);
    await this.generate(trimmed);
  }

  // ---- Listen phase ------------------------------------------------------

  private async listen(): Promise<void> {
    this.setPhase('LISTENING');

    const result = await this.recorder.record();

    if (this.isCancelled) return;

    if (!result) {
      this.setPhase('IDLE');
      return;
    }

    await this.transcribe(result.uri);
  }

  // ---- Transcribe phase --------------------------------------------------

  private async transcribe(uri: string): Promise<void> {
    this.setPhase('THINKING');
    let finalText = '';

    try {
      finalText = await this.stt.transcribeFile(uri, (partial) => {
        if (!this.isCancelled) this.callbacks.onSttPartial(partial);
      });
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? err.message : 'Transcription failed',
      );
      this.setPhase('IDLE');
      return;
    }

    if (this.isCancelled || !finalText) {
      this.setPhase('IDLE');
      return;
    }

    this.callbacks.onSttFinal(finalText);
    await this.generate(finalText);
  }

  // ---- Generate phase ----------------------------------------------------

  private async generate(userText: string): Promise<void> {
    this.setPhase('THINKING');

    this.audioPlayer.reset();
    this.isDraining = false;

    const messages: ConversationMessage[] = [];
    if (this.config.systemPrompt) {
      messages.push({ role: 'system', content: this.config.systemPrompt });
    }
    messages.push(...this.history, { role: 'user', content: userText });

    let fullResponse = '';
    let llmDone = false;
    const clauses: string[] = [];
    let ttsStarted = false;
    let tokenCount = 0;

    const perfStart = await captureSnapshot();
    logLlmStart(perfStart);
    const llmStartMs = Date.now();

    const onQueueEmpty = () => {
      if (llmDone) this.onSpeakingDone(userText, fullResponse);
    };

    const streamer = new ClauseStreamer((clause) => {
      clauses.push(clause);
      if (!ttsStarted) {
        ttsStarted = true;
        this.setPhase('SPEAKING');
      }
      void this.drainTtsQueue(clauses, onQueueEmpty);
    });

    try {
      await this.llm.generate(messages, (token) => {
        if (this.isCancelled) return;
        tokenCount++;
        fullResponse += token;
        this.callbacks.onLlmToken(token);
        streamer.push(token);
      });
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? err.message : 'LLM generation failed',
      );
      this.setPhase('IDLE');
      return;
    }

    const durationMs = Date.now() - llmStartMs;
    const perfEnd = await captureSnapshot();
    logLlmDone(perfStart, perfEnd, durationMs, tokenCount);

    streamer.flush();
    llmDone = true;
    this.callbacks.onLlmDone(fullResponse);

    if (clauses.length === 0 && !this.isCancelled) {
      this.onSpeakingDone(userText, fullResponse);
    }
  }

  // ---- TTS queue ---------------------------------------------------------

  private async drainTtsQueue(
    queue: string[],
    onEmpty: () => void,
  ): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;

    try {
      while (!this.ttsAborted) {
        const clause = queue.shift();
        if (!clause) {
          onEmpty();
          break;
        }

        const pcm = await this.tts.synthesize(clause);
        if (this.ttsAborted) break;

        this.audioPlayer.addChunk(pcm, this.tts.sampleRate);
        await this.audioPlayer.playAndClear();
      }
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? `TTS error: ${err.message}` : 'TTS failed',
      );
    } finally {
      this.isDraining = false;
      if (queue.length > 0 && !this.ttsAborted) {
        void this.drainTtsQueue(queue, onEmpty);
      }
    }
  }

  // ---- Loop back ---------------------------------------------------------

  private onSpeakingDone(userText: string, assistantText: string): void {
    if (this.isCancelled) {
      this.setPhase('IDLE');
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

    setTimeout(() => {
      if (!this.isCancelled) void this.listen();
    }, AppConfig.pipeline.postSpeakingDelayMs);
  }

  // ---- Helpers -----------------------------------------------------------

  private abortTts(): void {
    this.ttsAborted = true;
    void this.audioPlayer.stop().catch(() => {});
    this.llm.cancelGeneration();
  }

  private setPhase(phase: PipelinePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.callbacks.onPhaseChange(phase);
  }
}
