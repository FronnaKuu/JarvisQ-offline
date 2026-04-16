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
  },

  // Amplitude-based VAD (Voice Activity Detection) during recording.
  // Operates on dBFS values from expo-av's metering feature.
  vad: {
    // dBFS above which we consider speech has started
    speechThresholdDb: -35,
    // dBFS below which silence starts counting
    silenceThresholdDb: -45,
    // Milliseconds of continuous silence before recording auto-stops
    silenceDurationMs: 900,
    // Minimum speech duration to bother transcribing (filter out noise clicks)
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
    defaultLanguage: 'en',
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
} as const;
