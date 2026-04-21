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
import type {
  ISttService,
  IResponder,
  ITtsService,
  ConversationMessage,
  TtsRuntimeOptions,
} from '@core/inference/types';
import type { PipelinePhase, TtsBufferMode } from '@domain/types';

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
  /**
   * 'streaming' — synthesize + speak each clause as soon as it's complete
   *   (lowest time-to-first-audio, but TTS inference runs while the responder
   *   is still decoding and can stall token delivery on weaker devices).
   * 'buffered' — wait for the full response, then synthesize once.
   */
  ttsBufferMode?: TtsBufferMode;
  ttsOptions?: TtsRuntimeOptions;
  /**
   * When true, the listen loop re-arms the microphone automatically after
   * the assistant finishes speaking (hands-free chaining). Default false —
   * push-to-talk — because Android devices without hardware AEC can capture
   * the TTS tail and self-trigger a new turn.
   */
  handsFreeMode?: boolean;
}

export interface PipelineServices {
  stt: ISttService;
  /**
   * Mode-agnostic response provider. LlmResponder for chat mode,
   * TranslationResponder for translation mode. The pipeline never branches
   * on mode — it just asks the responder for a reply.
   */
  responder: IResponder;
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
  private muteTts = false;
  // Push-to-talk by default. Hands-free chaining reopens the microphone
  // shortly after TTS ends; on devices without hardware AEC (most Android
  // phones using expo-av's MIC source) this captures the decaying speaker
  // output and feeds it back as a new user turn. Toggle at runtime through
  // `config.handsFreeMode` (see updateConfig) so users can opt in.
  private autoLoop = false;
  private history: ConversationMessage[] = [];

  private readonly recorder: IAudioRecorder;
  private readonly audioPlayer: IAudioPlayer;
  private readonly stt: ISttService;
  private readonly responder: IResponder;
  private readonly tts: ITtsService;
  private readonly callbacks: PipelineCallbacks;
  private config: PipelineConfig;

  constructor(
    deps: PipelineDeps,
    callbacks: PipelineCallbacks,
    config: PipelineConfig = {},
  ) {
    this.stt = deps.services.stt;
    this.responder = deps.services.responder;
    this.tts = deps.services.tts;
    this.recorder = deps.recorder;
    this.audioPlayer = deps.audioPlayer;
    this.callbacks = callbacks;
    this.config = config;
    if (config.handsFreeMode !== undefined) {
      this.autoLoop = config.handsFreeMode;
    }
  }

  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.handsFreeMode !== undefined) {
      this.autoLoop = config.handsFreeMode;
    }
  }

  clearHistory(): void {
    this.history = [];
  }

  /**
   * Silent mode: skip TTS synthesis. Used by text/chat mode so the assistant
   * reply is shown as text only. The listen loop is push-to-talk in both
   * modes (see `autoLoop`), so this no longer toggles microphone re-arming.
   */
  setSilentMode(silent: boolean): void {
    this.muteTts = silent;
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

    let fullResponse = '';
    let responderDone = false;
    const clauses: string[] = [];
    let ttsStarted = false;
    let tokenCount = 0;

    const perfStart = await captureSnapshot();
    logLlmStart(perfStart);
    const startMs = Date.now();

    const onQueueEmpty = () => {
      if (responderDone) this.onSpeakingDone(userText, fullResponse);
    };

    const isBuffered =
      (this.config.ttsBufferMode ?? 'streaming') === 'buffered';

    const streamer = new ClauseStreamer((clause) => {
      clauses.push(clause);
      if (this.muteTts || isBuffered) return;
      if (!ttsStarted) {
        ttsStarted = true;
        this.setPhase('SPEAKING');
      }
      void this.drainTtsQueue(clauses, onQueueEmpty);
    });

    try {
      await this.responder.respond(userText, this.history, (token) => {
        if (this.isCancelled) return;
        tokenCount++;
        fullResponse += token;
        this.callbacks.onLlmToken(token);
        streamer.push(token);
      });
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? err.message : 'Response generation failed',
      );
      this.setPhase('IDLE');
      return;
    }

    const durationMs = Date.now() - startMs;
    const perfEnd = await captureSnapshot();
    logLlmDone(perfStart, perfEnd, durationMs, tokenCount);

    streamer.flush();
    responderDone = true;
    this.callbacks.onLlmDone(fullResponse);

    if (this.muteTts) {
      this.onSpeakingDone(userText, fullResponse);
      return;
    }

    if (isBuffered && clauses.length > 0 && !this.isCancelled) {
      this.setPhase('SPEAKING');
      void this.drainTtsQueue(clauses, onQueueEmpty);
      return;
    }

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

        await this.tts.speak(
          clause,
          this.audioPlayer,
          this.config.ttsOptions,
        );
        if (this.ttsAborted) break;
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

    if (!this.autoLoop) {
      this.setPhase('IDLE');
      return;
    }

    setTimeout(() => {
      if (!this.isCancelled) void this.listen();
    }, AppConfig.pipeline.handsFreePostSpeakingDelayMs);
  }

  // ---- Helpers -----------------------------------------------------------

  private abortTts(): void {
    this.ttsAborted = true;
    void this.audioPlayer.stop().catch(() => {});
    void this.tts.stop().catch(() => {});
    this.responder.cancel();
  }

  private setPhase(phase: PipelinePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.callbacks.onPhaseChange(phase);
  }
}
