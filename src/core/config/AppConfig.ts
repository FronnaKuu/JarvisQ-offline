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
  },

  // LLM configuration
  llm: {
    contextSize: 2048,
    defaultTemperature: 0.7,
    defaultMaxTokens: 256,
    defaultTopP: 0.9,
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

  // Translation mode defaults and supported NMT pairs. The supported pairs
  // list is authoritative — the mode-picker UI and the translator loader both
  // read it, so adding a new Bergamot pair here is enough to surface it in
  // the UI and trigger on-demand download.
  translation: {
    defaultMode: 'conversation' as const,
    defaultEngine: 'nmt' as const,
    defaultSourceLang: 'en',
    defaultTargetLang: 'it',
    // BCP-47 pair ids (source-target). Must match the keys of
    // TRANSLATOR_PROFILES in ModelConfig.
    supportedPairs: [
      'en-it', 'it-en',
      'en-es', 'es-en',
      'en-fr', 'fr-en',
      'en-de', 'de-en',
      'en-pt', 'pt-en',
    ] as const,
    // Default LLM prompt prefix when translationEngine = 'llm'. The target
    // language is appended at call time so the same template works for any
    // pair without branching.
    llmPromptTemplate:
      'Translate the following text to {{target}}. Output only the translation, no commentary.',
  },
} as const;
