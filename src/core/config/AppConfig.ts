// ─── App Configuration ───────────────────────────────────────────────────────
// All constants live here — no hardcoded values elsewhere.

export const AppConfig = {
  // Pipeline timing
  pipeline: {
    vadSilenceDurationMs: 300,
    vadThreshold: 0.5,
    listenTimeoutMs: 20_000,
    minHardBoundaryChars: 6,
    minSoftBoundaryChars: 20,
    hardBoundaries: /[.!?;]/,
    softBoundaries: /[,:—]/,
  },

  // STT configuration
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
    gpuLayers: 99,
  },

  // TTS configuration
  tts: {
    defaultVoice: 'F1',
    defaultSpeed: 1.0,
    defaultLanguage: 'en',
    numInferenceSteps: 5,
  },

  // Conversation management
  conversation: {
    defaultTitle: 'New Conversation',
    defaultSystemPrompt:
      'You are Jarvis, a concise and helpful AI assistant. Respond naturally and briefly.',
    maxContextTurns: 10,
  },

  // Model storage
  models: {
    directoryName: 'models',
    minValidFileSizeBytes: 10_000,
  },
} as const;
