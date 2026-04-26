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
  /**
   * When true, LISTEN bypasses the file-based recorder+transcribeFile path
   * and streams PCM directly into stt.transcribeLive() — the parakeet
   * addon's Silero VAD segments the input and emits per-segment partial
   * transcripts as the user speaks. Requires a parakeet profile with
   * vadModelSrc (AppConfig.stt.parakeetStreamingEnabled) and a live
   * recorder factory on the pipeline deps.
   */
  dictationMode?: boolean;
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

/**
 * Factory for the PCM-streaming recorder used by dictation mode. Kept as
 * an optional factory (not a singleton) because each dictation session
 * needs a freshly initialised mic pipeline. The return type is loose so
 * we don't leak the react-native-live-audio-stream dependency into
 * pipeline core.
 */
export interface LiveRecorderHandle {
  chunks(): AsyncIterable<Uint8Array>;
  stop(): Promise<void>;
}
export type LiveRecorderFactory = () => Promise<LiveRecorderHandle>;

export interface PipelineDeps {
  services: PipelineServices;
  recorder: IAudioRecorder;
  audioPlayer: IAudioPlayer;
  /** Optional — only required when PipelineConfig.dictationMode is true. */
  liveRecorder?: LiveRecorderFactory;
}

export class VoicePipeline {
  private phase: PipelinePhase = 'IDLE';
  private isCancelled = false;
  private ttsAborted = false;
  private isDraining = false;
  private speakingDoneFired = false;
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
  private readonly liveRecorderFactory?: LiveRecorderFactory;
  private liveRecorderHandle: LiveRecorderHandle | null = null;
  /**
   * Set while listenDictation is active. stopListening awaits this so the
   * native streaming session has a chance to close on the server before
   * the next listen turn starts a new one — otherwise the server throws
   * "Streaming session already active for this instance".
   */
  private activeDictationPromise: Promise<void> | null = null;
  /**
   * Distinguishes a graceful "submit" (commitListening) from a hard cancel
   * (stopListening). On commit, the still-open partial transcript is the
   * user's best stable read of what they just said and must reach the LLM —
   * otherwise short utterances ending before a VAD silence boundary never
   * trigger a turn. On cancel, partials are discarded.
   */
  private isCommitting = false;
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
    this.liveRecorderFactory = deps.liveRecorder;
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
    this.isCommitting = false;
    await this.listen();
  }

  /**
   * Graceful end-of-input for dictation. Stops the live recorder so the SDK
   * streaming session drains naturally (final segment + onSttFinal + LLM
   * turn). Falls back to stopListening when no dictation turn is active so
   * non-dictation callers still get cancel semantics by default.
   */
  async commitListening(): Promise<void> {
    if (!this.liveRecorderHandle || !this.activeDictationPromise) {
      await this.stopListening();
      return;
    }
    this.isCommitting = true;
    await this.liveRecorderHandle.stop();
    this.liveRecorderHandle = null;
    await this.activeDictationPromise.catch(() => {});
  }

  async stopListening(): Promise<void> {
    this.isCancelled = true;
    if (this.liveRecorderHandle) {
      // Stopping the live recorder terminates the PCM AsyncIterable, which
      // in turn ends the SDK transcribeStream session. transcribeLive then
      // resolves naturally.
      await this.liveRecorderHandle.stop();
      this.liveRecorderHandle = null;
    }
    await this.recorder.abort();
    this.abortTts();
    // Wait for the active dictation turn (if any) to complete — it must
    // finish closing the server streaming session before we allow a new
    // listen turn to start, otherwise the native addon rejects the next
    // startStreaming with "Streaming session already active".
    if (this.activeDictationPromise) {
      await this.activeDictationPromise.catch(() => {});
    }
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
    // Re-entrancy guard for the dictation path. The SDK's transcribeStream
    // duplex session is one-per-model-instance: opening a second session
    // before the first has fully torn down throws "Streaming session already
    // active for this instance". This can happen when a touch event, a
    // hands-free auto-rearm, and the auto-commit timer race each other —
    // `phase !== 'IDLE'` alone doesn't catch it because the second caller
    // may arrive while phase is transitioning. Wait for the in-flight turn
    // to finish (and its server session to close) before proceeding.
    if (this.activeDictationPromise) {
      console.warn('[pipeline] listen() called while dictation turn active — awaiting prior turn');
      await this.activeDictationPromise.catch(() => {});
      if (this.isCancelled) return;
    }

    this.setPhase('LISTENING');

    if (this.config.dictationMode && this.liveRecorderFactory) {
      this.activeDictationPromise = this.listenDictation();
      try {
        await this.activeDictationPromise;
      } finally {
        this.activeDictationPromise = null;
        this.isCommitting = false;
      }
      return;
    }

    const result = await this.recorder.record();

    if (this.isCancelled) return;

    if (!result) {
      // Hands-free: if no speech was captured in the listen window, re-arm
      // the recorder so the user can speak whenever they like. The VAD gate
      // inside the recorder prevents ambient noise from falsely triggering
      // a turn. Push-to-talk mode still returns to IDLE and waits for a tap.
      if (this.autoLoop) {
        setTimeout(() => {
          if (!this.isCancelled) void this.listen();
        }, 0);
        return;
      }
      this.setPhase('IDLE');
      return;
    }

    await this.transcribe(result.uri);
  }

  /**
   * Dictation path: streams PCM from the live recorder straight into the
   * parakeet addon's VAD-driven streaming recognizer. Per-segment partials
   * surface via onSttPartial as the user speaks. The accumulated transcript
   * is used as the user's final turn after stopListening() is called.
   */
  private async listenDictation(): Promise<void> {
    if (!this.liveRecorderFactory) {
      this.callbacks.onError('Dictation mode requires a live recorder');
      this.setPhase('IDLE');
      return;
    }

    console.log('[dictation] starting live recorder…');
    let handle: LiveRecorderHandle;
    try {
      handle = await this.liveRecorderFactory();
      console.log('[dictation] live recorder ready');
    } catch (err) {
      console.error('[dictation] recorder error', err);
      this.callbacks.onError(
        err instanceof Error
          ? `Recorder: ${err.message}\n${err.stack ?? ''}`
          : 'Failed to start live recorder',
      );
      this.setPhase('IDLE');
      return;
    }
    this.liveRecorderHandle = handle;

    let finalText = '';
    // The native StreamingProcessor now emits two kinds of segments:
    //   - committed (isPartial=false) — final transcript for a closed VAD
    //     range; appended to the running transcript and frozen.
    //   - partial (isPartial=true) — in-progress revision of the still-open
    //     VAD segment; replaces only the running tail and is dropped on the
    //     next commit. The committed log + the latest partial together form
    //     what the user sees as "live transcript".
    let committedText = '';
    let runningPartial = '';
    const composeDisplay = () =>
      committedText && runningPartial
        ? `${committedText} ${runningPartial}`
        : committedText || runningPartial;
    // End-of-utterance debounce: commit automatically after a prolonged
    // silence following the last VAD-final segment. Cancelled by any new
    // partial/final (the user resumed speaking).
    let autoCommitTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelAutoCommit = (): void => {
      if (autoCommitTimer) {
        clearTimeout(autoCommitTimer);
        autoCommitTimer = null;
      }
    };
    const scheduleAutoCommit = (): void => {
      cancelAutoCommit();
      autoCommitTimer = setTimeout(() => {
        autoCommitTimer = null;
        if (this.isCancelled || this.isCommitting) return;
        if (!committedText) return;
        console.log(
          `[dictation] auto-commit after ${AppConfig.stt.dictationAutoCommitMs}ms silence`,
        );
        void this.commitListening();
      }, AppConfig.stt.dictationAutoCommitMs);
    };
    try {
      console.log('[dictation] opening transcribeStream…');
      finalText = await this.stt.transcribeLive(
        handle.chunks(),
        (segment, isPartial) => {
          const cleaned = segment.trim();
          if (!cleaned) return;
          if (isPartial) {
            runningPartial = cleaned;
            // User is still inside an open VAD range — defer the auto-commit.
            cancelAutoCommit();
          } else {
            committedText = committedText
              ? `${committedText} ${cleaned}`
              : cleaned;
            // The freshly committed range supersedes the in-flight partial.
            runningPartial = '';
            // Arm the silence timer; if no new speech arrives within the
            // window the turn is auto-submitted to the LLM.
            scheduleAutoCommit();
          }
          const display = composeDisplay();
          console.log(
            `[dictation] segment ${isPartial ? '[partial]' : '[final]'} "${cleaned}" → display:`,
            display,
          );
          if (!this.isCancelled) this.callbacks.onSttPartial(display);
        },
        { drainGraceMs: AppConfig.stt.streamDrainGraceMs },
      );
      cancelAutoCommit();
      // The SDK's session iterator may close via the drain timeout before
      // the last final lands. committedText is the source of truth because
      // it accumulates only confirmed (non-partial) segments observed by
      // the JS side. On a graceful commit (tap-to-stop in dictation mode),
      // promote the still-open runningPartial too — short utterances often
      // end before VAD detects a silence boundary, so the partial is the
      // only transcript we have. On a hard cancel, partials stay discarded.
      if (committedText.length > finalText.length) {
        finalText = committedText;
      }
      if (this.isCommitting && runningPartial) {
        const merged = committedText
          ? `${committedText} ${runningPartial}`
          : runningPartial;
        if (merged.length > finalText.length) {
          finalText = merged;
        }
      }
      console.log('[dictation] stream closed, finalText=', finalText);
    } catch (err) {
      cancelAutoCommit();
      console.error('[dictation] transcribeLive error', err);
      this.callbacks.onError(
        err instanceof Error
          ? `Live STT: ${err.message}\n${err.stack ?? ''}`
          : 'Live transcription failed',
      );
      this.liveRecorderHandle = null;
      this.setPhase('IDLE');
      return;
    }
    this.liveRecorderHandle = null;

    if (this.isCancelled) {
      this.setPhase('IDLE');
      return;
    }

    const trimmed = finalText.trim();
    if (!trimmed) {
      this.setPhase('IDLE');
      return;
    }

    this.callbacks.onSttFinal(trimmed);
    await this.generate(trimmed);
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

    if (this.isCancelled) {
      this.setPhase('IDLE');
      return;
    }

    if (!finalText) {
      // Empty transcription (silence, [BLANK_AUDIO], or unintelligible). In
      // hands-free this must not drop back to IDLE — otherwise the user has
      // to tap again to resume. Re-arm the recorder; VAD keeps idle cycles
      // cheap.
      if (this.autoLoop) {
        setTimeout(() => {
          if (!this.isCancelled) void this.listen();
        }, 0);
        return;
      }
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
    this.speakingDoneFired = false;

    let fullResponse = '';
    let responderDone = false;
    const clauses: string[] = [];
    let ttsStarted = false;
    let tokenCount = 0;

    const perfStart = await captureSnapshot();
    logLlmStart(perfStart);
    const startMs = Date.now();

    // The queue can transiently empty between two clauses (we just spoke
    // the current one and the next hasn't been pushed yet by the streamer
    // running on responder tokens). drainTtsQueue then awaits player drain
    // and fires onEmpty — but by the time drain resolves, more clauses may
    // already be back in the queue. Without re-checking here, onSpeakingDone
    // fires while TTS still has audio to play; the hands-free auto-rearm
    // then opens the mic during the assistant's own speech and the dictation
    // path captures it as a new user turn (regression observed after the
    // parakeet streaming switch — the file-mode VAD was lenient enough to
    // discard the captured tail, Silero treats it as legitimate speech).
    const onQueueEmpty = () => {
      if (responderDone && clauses.length === 0) {
        this.onSpeakingDone(userText, fullResponse);
      }
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

    // Only fire onSpeakingDone here when nothing ever started draining.
    // If a drain is in flight (e.g. awaiting playback of the final clause
    // already shifted off the queue), the onQueueEmpty callback will fire
    // onSpeakingDone once playback finishes.
    if (
      clauses.length === 0 &&
      !this.isDraining &&
      !this.isCancelled
    ) {
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
          // With pipelined playback, `speak` returns after queueing the
          // clause rather than waiting for its audio to finish. Drain the
          // player so the "speaking done" signal only fires after the
          // last clause has actually finished playing.
          await this.audioPlayer.drain();
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
    if (this.speakingDoneFired) return;
    this.speakingDoneFired = true;

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
