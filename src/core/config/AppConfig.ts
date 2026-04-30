// ─── App Configuration ───────────────────────────────────────────────────────
// All constants live here — no hardcoded values elsewhere.

export const AppConfig = {
  // Pipeline timing
  pipeline: {
    listenTimeoutMs: 20_000,
    minHardBoundaryChars: 6,
    minSoftBoundaryChars: 20,
    hardBoundaries: /[.!?;]/,
    softBoundaries: /[,:—]/,
    // Hard cap on a single clause sent to the TTS engine. Supertonic's text
    // encoder silently truncates inputs past its internal sequence limit, so
    // unbounded clauses (e.g. when LLM tokens carry trailing whitespace and
    // the boundary char ends up mid-token) cause whole sentences to drop out
    // of the spoken audio. The streamer falls back to the last whitespace
    // before this cap when no natural boundary has fired in time.
    maxClauseChars: 200,
    // Delay between TTS finishing and microphone re-activating.
    // Prevents the system from capturing its own speaker output as user speech.
    // Set to 1500ms: Android speakers can ring/echo for up to ~1s after playback
    // stops, and the expo-av AudioTrack teardown itself takes ~100–200ms.
    postSpeakingDelayMs: 1500,
    // Delay before re-arming the microphone in hands-free auto-loop.
    // expo-av's MIC source has no hardware AEC, so we wait for the speaker
    // tail to decay. Kept tight (1200ms) because onSpeakingDone now fires
    // only after playback truly ends — the old 2500ms was needed to cover a
    // race where the timer started while TTS was still playing.
    handsFreePostSpeakingDelayMs: 1200,
  },

  // Audio capture parameters (platform recorders read these — no hardcoded
   // values in the platform layer).
  recording: {
    // Android MediaRecorder inserts ~300 ms of AAC encoder pre-roll at the
    // start of every capture; the @qvac/sdk FFmpegDecoder drops those frames
    // ("Skipping 300ms ... to remove encoder artifacts") to avoid artifacts.
    // We therefore start the recorder, then wait preRollMs before emitting
    // the "listening" signal and arming VAD, so the discarded slice is
    // silence rather than the user's first syllable.
    preRollMs: 350,
    // AAC bitrate for Android captures at 16 kHz mono. 128 kbps is expo-av's
    // legacy default; raising it improves consonant clarity for Whisper.
    androidBitrate: 128_000,
    // MediaRecorder.AudioSource for the live PCM stream feeding parakeet.
    // 1 = MIC (raw mic feed, what HearoPilot uses with sherpa-onnx + parakeet
    //         and what their ASR is tuned against — minimal platform DSP).
    // 6 = VOICE_RECOGNITION (Android applies an ASR-tuned AGC/NS profile;
    //         on some devices this distorts plosives and clips quiet speech).
    // 9 = UNPROCESSED (truly raw, but unsupported on older devices).
    // OnePlus CPH2769 with src=1 (MIC) gives gain too low for Silero
    // threshold 0.5 — VAD never opens a segment despite 60s of speech.
    // src=6 (VOICE_RECOGNITION) applies an ASR-tuned AGC/NS profile that
    // lifts the signal into Silero's range. HearoPilot uses MIC with
    // sherpa-onnx, but their VAD chain isn't the same.
    androidLiveAudioSource: 6,
  },

  // Amplitude-based VAD (Voice Activity Detection) during recording.
  // Operates on dBFS values from expo-av's metering feature.
  //
  // The VAD has two gates that MUST BOTH pass before a recording is
  // considered to contain real speech:
  //   1. Sustained gate — amplitude stays above `speechThresholdDb` for at
  //      least `minSpeechDurationMs` cumulative ms. Kills brief transients
  //      like clicks, door slams, and the decaying tail of the device's own
  //      TTS output (which the speaker→mic path echoes at low amplitude).
  //   2. Peak gate — at least one sample exceeds `speechThresholdDb +
  //      peakMarginDb`. Human speech close to the mic routinely hits
  //      -20…-15 dBFS; speaker residue typically caps around -30 dBFS.
  // This makes the VAD robust against hands-free self-triggering WITHOUT
  // any text-level heuristic downstream.
  vad: {
    // dBFS above which we consider a sample to be "speech-like"
    speechThresholdDb: -35,
    // Required peak above `speechThresholdDb` to accept as real speech
    peakMarginDb: 10,
    // dBFS below which silence starts counting
    silenceThresholdDb: -45,
    // Milliseconds of continuous silence before recording auto-stops
    silenceDurationMs: 900,
    // Cumulative ms of above-threshold audio required to arm "speech detected"
    minSpeechDurationMs: 300,
  },

  // STT configuration (passed to Whisper model config in @qvac/sdk loadModel)
  stt: {
    defaultLanguage: 'en',
    nThreads: 2,
    suppressNonSpeech: true,
    vadThreshold: 0.5,
    vadMinSpeechDurationMs: 200,
    vadMinSilenceDurationMs: 300,
    /**
     * Enables the parakeet streaming path: downloads silero_vad.onnx with
     * the parakeet model and wires vadModelSrc into the parakeet SDK
     * plugin so transcribeStream can invoke VAD-driven segmentation.
     *
     * Leave false until the parakeet native addon has been rebuilt with
     * docs/qvac-patches/0001-*.patch applied — the stock 0.3.1 binary
     * ignores vadModelPath and downloading the ~2 MB VAD model is wasted
     * bandwidth until the new .bare is in place.
     */
    parakeetStreamingEnabled: true,
    /**
     * Grace period after the PCM input is closed (session.end()) before the
     * SDK duplex iterator is force-destroyed. Some native streaming addons
     * fail to emit a terminal "JobEnded" event when their input ends, which
     * leaves the response iterator hanging. Bounded so the dictation commit
     * always returns and the LLM turn fires.
     */
    streamDrainGraceMs: 5_000,
    /**
     * "End-of-utterance" silence in the streaming dictation path. The Silero
     * VAD already closes a segment on `minSilenceDurationMs` (~500 ms) inside
     * a single utterance — but the user expects the LLM to fire only after a
     * longer pause that signals "I'm done speaking". This debounce starts
     * after each committed [final] segment and is cancelled by any new
     * partial/final, mirroring the file-mode VAD's silenceDurationMs=900
     * behavior the user is used to.
     *
     * Set to 2500 ms: combined with VAD's 500 ms endpointing this gives
     * roughly a 3 s "I'm done speaking" pause before the LLM turn fires —
     * long enough to absorb a thinking-pause mid-sentence without prematurely
     * committing, short enough that the user doesn't perceive the assistant
     * as sluggish to react.
     */
    dictationAutoCommitMs: 2_500,
    /**
     * Bounds for the user-exposed dictation auto-commit setting. The Settings
     * screen reads min/max/step from here so the slider/input never carries
     * magic numbers, and SettingsStore clamps any persisted override into the
     * same range. Override is `undefined` by default — the pipeline falls back
     * to `dictationAutoCommitMs` above.
     */
    endOfTurnRange: {
      minMs: 800,
      maxMs: 6_000,
      stepMs: 100,
    },
    /**
     * Silero VAD tuning for the parakeet streaming path. Modeled on the
     * HearoPilot dictation profile (sherpa-onnx + parakeet-tdt-0.6b-v3-int8)
     * which feels live because partials surface every ~1.5 s — not on the
     * native addon's batch-style 30 s ceiling.
     *
     * Our addon's StreamingProcessor only runs Parakeet at VAD endpoints
     * (not on partial buffers like HearoPilot's sherpa-onnx loop). Aggressive
     * forced fake-endpoints (sub-2s) trigger Parakeet on near-silence cuts
     * and the recognizer hallucinates filler tokens ("Yeah.", "No.") — a
     * known TDT failure mode on short silent segments (sherpa-onnx#2918).
     *
     * Until the native StreamingProcessor learns true partial decoding, the
     * safe profile is: trust VAD's natural endpointing for accuracy, keep
     * a moderate ceiling so a continuous talker still sees periodic chunks,
     * and rely on samplesOverlap to bridge cuts.
     *
     * - threshold: 0.5 keeps Silero's published sensitivity.
     * - minSpeechDurationMs: 250 ms — drop ultra-short bursts (clicks).
     * - minSilenceDurationMs: 500 ms — match HearoPilot's vadMinSilenceDuration
     *   default (AppSettings.kt). 300 ms cut mid-word on natural pauses; 500 ms
     *   gives the recognizer a complete clause per segment.
     * - maxSpeechDurationS: 10 s — match HearoPilot's vadMaxSpeechDuration.
     *   Partials drive the live UX, so a tighter ceiling forces a commit
     *   before TDT accuracy degrades on overlong contexts.
     * - speechPadMs: 100 ms — pad each cut so plosives aren't clipped.
     * - samplesOverlap: 0.3 s — context carryover at endpoint commits.
     * - partialDecodeIntervalMs: 1500 ms — mirrors HearoPilot's cadence.
     *   The native StreamingProcessor re-runs Parakeet on the open
     *   segment every 1.5 s of new audio, surfacing partials with
     *   isPartial=true that the UI can replace.
     */
    streamingVad: {
      threshold: 0.5,
      minSpeechDurationMs: 250,
      minSilenceDurationMs: 500,
      maxSpeechDurationS: 10,
      speechPadMs: 100,
      samplesOverlap: 0.3,
      partialDecodeIntervalMs: 1500,
    },
    /**
     * Cap on ONNX Runtime threads for the parakeet recognizer. HearoPilot
     * pins this to 2 deliberately to keep the LLM (llama.cpp) from being
     * starved of big cores — the same logic applies here, since Qwen and
     * Parakeet share the same physical CPU on Android.
     */
    parakeetMaxThreads: 2,
  },

  // LLM configuration
  llm: {
    contextSize: 2048,
    defaultTemperature: 0.7,
    defaultMaxTokens: 256,
    defaultTopP: 0.9,
  },

  // Audio playback (mobile)
  audio: {
    // Short silent lead-in inserted before the first sample of every clause.
    // Android's low-level audio drops a handful of frames when an AudioTrack
    // starts; the silence absorbs that loss so the first phoneme is intact.
    leadInMs: 80,
    // Safety margin added on top of the calculated audio duration when
    // waiting for didJustFinish. Bounds the wait so a missed status event
    // can't hang the playback chain.
    finishTimeoutMarginMs: 1000,
    // Filename prefix for transient WAV scratch files written to the app's
    // cache directory and deleted after each clause has played.
    tempFilePrefix: 'tts_',
    // Status update interval requested from expo-audio. Kept tight enough
    // that didJustFinish is not delayed past the safety margin above.
    statusUpdateIntervalMs: 500,
    // Hard cap on stop()'s wait for the playback chain to settle. A
    // malfunctioning player must not block UI teardown indefinitely.
    stopDrainTimeoutMs: 250,
  },

  // TTS configuration
  tts: {
    defaultVoice: 'F1',
    defaultSpeed: 1.0,
    defaultPitch: 1.0,
    defaultLanguage: 'en',
    defaultEngine: 'supertonic' as const,
    defaultBufferMode: 'streaming' as const,
    // Empty string means "follow the device's default TTS language selected
    // in Android/iOS system settings". Any BCP-47 tag here overrides it.
    defaultSystemLanguage: '',
  },

  // Model storage
  models: {
    directoryName: 'qvac_models',
    minValidFileSizeBytes: 1024,
  },

  // Connectivity probe — used before starting a model download to warn the
  // user when they are offline. The endpoint should answer with any 2xx/3xx
  // response to a HEAD request. `generate_204` is a captive-portal probe
  // target served globally by Google: small, no body, long-term stable.
  network: {
    probeUrl: 'https://www.google.com/generate_204',
    probeTimeoutMs: 3000,
  },

  // Conversation management
  conversation: {
    defaultTitle: 'New Conversation',
    defaultSystemPrompt:
      'You are Jarvis, a concise and helpful AI assistant. Respond naturally and briefly.',
    maxContextTurns: 10,
  },

  // Translation mode defaults. The authoritative language catalog lives in
  // ModelConfig (BERGAMOT_LANG_MAP) — see resolveTranslatorPair() for the
  // direct/pivot routing. Adding a new Bergamot pair only requires one line
  // in that map.
  translation: {
    defaultMode: 'conversation' as const,
    defaultEngine: 'nmt' as const,
    defaultSourceLang: 'en',
    defaultTargetLang: 'it',
    // Default LLM prompt prefix when translationEngine = 'llm'. The target
    // language is appended at call time so the same template works for any
    // pair without branching.
    llmPromptTemplate:
      'Translate the following text to {{target}}. Output only the translation, no commentary.',
  },
} as const;
