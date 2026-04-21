// ─── Model Configuration ─────────────────────────────────────────────────────
// Centralizes model selection, load parameters, and HTTPS fallback URLs.
// Primary sources use the @qvac/sdk registry (P2P). Each profile also provides
// an HTTP fallback configuration for resilience when P2P peers are unavailable.

import {
  BERGAMOT_EN_IT,
  BERGAMOT_IT_EN,
  BERGAMOT_EN_ES,
  BERGAMOT_ES_EN,
  BERGAMOT_EN_FR,
  BERGAMOT_FR_EN,
  BERGAMOT_EN_DE,
  BERGAMOT_DE_EN,
  BERGAMOT_EN_PT,
  BERGAMOT_PT_EN,
  WHISPER_BASE_Q8_0,
  WHISPER_TINY_Q8_0,
  WHISPER_SMALL_Q8_0,
  WHISPER_LARGE_V3_TURBO,
  QWEN3_1_7B_INST_Q4,
  QWEN3_4B_INST_Q4_K_M,
  TTS_SUPERTONIC2_OFFICIAL_TEXT_ENCODER_SUPERTONE_FP32,
  TTS_SUPERTONIC2_OFFICIAL_DURATION_PREDICTOR_SUPERTONE_FP32,
  TTS_SUPERTONIC2_OFFICIAL_VECTOR_ESTIMATOR_SUPERTONE_FP32,
  TTS_SUPERTONIC2_OFFICIAL_VOCODER_SUPERTONE_FP32,
  TTS_SUPERTONIC2_OFFICIAL_UNICODE_INDEXER_SUPERTONE_FP32,
  TTS_SUPERTONIC2_OFFICIAL_TTS_CONFIG_SUPERTONE,
  TTS_SUPERTONIC2_OFFICIAL_VOICE_STYLE_SUPERTONE,
  PARAKEET_TDT_ENCODER_INT8,
  PARAKEET_TDT_DECODER_INT8,
  PARAKEET_TDT_PREPROCESSOR_INT8,
  PARAKEET_TDT_ENCODER_FP32,
  PARAKEET_TDT_ENCODER_DATA_FP32,
  PARAKEET_TDT_DECODER_FP32,
  PARAKEET_TDT_PREPROCESSOR_FP32,
  PARAKEET_TDT_VOCAB,
} from '@qvac/sdk';
import { AppConfig } from './AppConfig';
import {
  PARAKEET_HTTP,
  QWEN3_HTTP,
  SUPERTONIC_HTTP,
  WHISPER_HTTP,
} from './HttpModelSources';
import type { SttLoadConfig, WhisperSttLoadConfig } from '@core/inference/SttService';
import type { LlmLoadConfig } from '@core/inference/LlmService';
import type { TtsLoadConfig } from '@core/inference/TtsService';
import type { TranslatorLoadConfig } from '@core/inference/TranslatorService';

// ─── STT Profiles ─────────────────────────────────────────────────────────────

export interface SttProfile {
  id: string;
  label: string;
  estimatedBytes: number;
  buildLoadConfig: (useGpu: boolean, language: string) => SttLoadConfig;
  buildHttpFallbackConfig?: (useGpu: boolean, language: string) => SttLoadConfig;
}

export const STT_PROFILES: Record<string, SttProfile> = {
  whisper_base: {
    id: 'whisper_base',
    label: 'Whisper Base Q8 (~150 MB)',
    estimatedBytes: 153_000_000,
    buildLoadConfig: (useGpu, language): WhisperSttLoadConfig => ({
      engine: 'whisper',
      modelConstant: WHISPER_BASE_Q8_0,
      language,
      nThreads: AppConfig.stt.nThreads,
      vadThreshold: AppConfig.stt.vadThreshold,
      vadMinSpeechDurationMs: AppConfig.stt.vadMinSpeechDurationMs,
      vadMinSilenceDurationMs: AppConfig.stt.vadMinSilenceDurationMs,
      useGpu,
    }),
    buildHttpFallbackConfig: (useGpu, language): WhisperSttLoadConfig => ({
      engine: 'whisper',
      modelConstant: { src: WHISPER_HTTP.baseQ8, modelId: 'ggml-base-q8_0.bin' },
      language,
      nThreads: AppConfig.stt.nThreads,
      vadThreshold: AppConfig.stt.vadThreshold,
      vadMinSpeechDurationMs: AppConfig.stt.vadMinSpeechDurationMs,
      vadMinSilenceDurationMs: AppConfig.stt.vadMinSilenceDurationMs,
      useGpu,
    }),
  },
  whisper_tiny: {
    id: 'whisper_tiny',
    label: 'Whisper Tiny (~40 MB)',
    estimatedBytes: 42_000_000,
    buildLoadConfig: (useGpu, language): WhisperSttLoadConfig => ({
      engine: 'whisper',
      modelConstant: WHISPER_TINY_Q8_0,
      language,
      nThreads: AppConfig.stt.nThreads,
      vadThreshold: AppConfig.stt.vadThreshold,
      vadMinSpeechDurationMs: AppConfig.stt.vadMinSpeechDurationMs,
      vadMinSilenceDurationMs: AppConfig.stt.vadMinSilenceDurationMs,
      useGpu,
    }),
    buildHttpFallbackConfig: (useGpu, language): WhisperSttLoadConfig => ({
      engine: 'whisper',
      modelConstant: { src: WHISPER_HTTP.tinyQ8, modelId: 'ggml-tiny-q8_0.bin' },
      language,
      nThreads: AppConfig.stt.nThreads,
      vadThreshold: AppConfig.stt.vadThreshold,
      vadMinSpeechDurationMs: AppConfig.stt.vadMinSpeechDurationMs,
      vadMinSilenceDurationMs: AppConfig.stt.vadMinSilenceDurationMs,
      useGpu,
    }),
  },
  whisper_small: {
    id: 'whisper_small',
    label: 'Whisper Small Q8 — multilingual (~490 MB)',
    estimatedBytes: 490_000_000,
    buildLoadConfig: (useGpu, language): WhisperSttLoadConfig => ({
      engine: 'whisper',
      modelConstant: WHISPER_SMALL_Q8_0,
      language,
      nThreads: AppConfig.stt.nThreads,
      vadThreshold: AppConfig.stt.vadThreshold,
      vadMinSpeechDurationMs: AppConfig.stt.vadMinSpeechDurationMs,
      vadMinSilenceDurationMs: AppConfig.stt.vadMinSilenceDurationMs,
      useGpu,
    }),
    buildHttpFallbackConfig: (useGpu, language): WhisperSttLoadConfig => ({
      engine: 'whisper',
      modelConstant: { src: WHISPER_HTTP.smallQ8, modelId: 'ggml-small-q8_0.bin' },
      language,
      nThreads: AppConfig.stt.nThreads,
      vadThreshold: AppConfig.stt.vadThreshold,
      vadMinSpeechDurationMs: AppConfig.stt.vadMinSpeechDurationMs,
      vadMinSilenceDurationMs: AppConfig.stt.vadMinSilenceDurationMs,
      useGpu,
    }),
  },
  whisper_large_v3_turbo: {
    id: 'whisper_large_v3_turbo',
    label: 'Whisper Large V3 Turbo — best quality (~1.6 GB)',
    estimatedBytes: 1_600_000_000,
    buildLoadConfig: (useGpu, language): WhisperSttLoadConfig => ({
      engine: 'whisper',
      modelConstant: WHISPER_LARGE_V3_TURBO,
      language,
      nThreads: AppConfig.stt.nThreads,
      vadThreshold: AppConfig.stt.vadThreshold,
      vadMinSpeechDurationMs: AppConfig.stt.vadMinSpeechDurationMs,
      vadMinSilenceDurationMs: AppConfig.stt.vadMinSilenceDurationMs,
      useGpu,
    }),
    buildHttpFallbackConfig: (useGpu, language): WhisperSttLoadConfig => ({
      engine: 'whisper',
      modelConstant: { src: WHISPER_HTTP.largeV3Turbo, modelId: 'ggml-large-v3-turbo.bin' },
      language,
      nThreads: AppConfig.stt.nThreads,
      vadThreshold: AppConfig.stt.vadThreshold,
      vadMinSpeechDurationMs: AppConfig.stt.vadMinSpeechDurationMs,
      vadMinSilenceDurationMs: AppConfig.stt.vadMinSilenceDurationMs,
      useGpu,
    }),
  },
  // Parakeet TDT 0.6B v3 — INT8 quantized (~670 MB via HTTPS).
  // Based on nvidia/parakeet-tdt-0.6b-v3 via istupakov/parakeet-tdt-0.6b-v3-onnx.
  // Supports 25 languages. Faster than Whisper on mobile hardware.
  parakeet_tdt_int8: {
    id: 'parakeet_tdt_int8',
    label: 'Parakeet TDT v3 INT8 — 25 languages (~670 MB)',
    estimatedBytes: 670_000_000,
    buildLoadConfig: (useGpu, _language) => ({
      engine: 'parakeet',
      modelType: 'tdt' as const,
      modelSrc: PARAKEET_TDT_ENCODER_INT8,
      decoderSrc: PARAKEET_TDT_DECODER_INT8,
      preprocessorSrc: PARAKEET_TDT_PREPROCESSOR_INT8,
      vocabSrc: PARAKEET_TDT_VOCAB,
      useGpu,
    }),
    buildHttpFallbackConfig: (useGpu, _language) => ({
      engine: 'parakeet',
      modelType: 'tdt' as const,
      modelSrc: { src: PARAKEET_HTTP.encoderInt8 },
      decoderSrc: { src: PARAKEET_HTTP.decoderInt8 },
      preprocessorSrc: { src: PARAKEET_HTTP.preprocessor },
      vocabSrc: { src: PARAKEET_HTTP.vocab },
      useGpu,
    }),
  },
  // Parakeet TDT 0.6B v3 — full FP32 precision (~2.5 GB via HTTPS).
  parakeet_tdt_fp32: {
    id: 'parakeet_tdt_fp32',
    label: 'Parakeet TDT v3 FP32 — 25 languages, best quality (~2.5 GB)',
    estimatedBytes: 2_500_000_000,
    buildLoadConfig: (useGpu, _language) => ({
      engine: 'parakeet',
      modelType: 'tdt' as const,
      modelSrc: PARAKEET_TDT_ENCODER_FP32,
      encoderDataSrc: PARAKEET_TDT_ENCODER_DATA_FP32,
      decoderSrc: PARAKEET_TDT_DECODER_FP32,
      preprocessorSrc: PARAKEET_TDT_PREPROCESSOR_FP32,
      vocabSrc: PARAKEET_TDT_VOCAB,
      useGpu,
    }),
    buildHttpFallbackConfig: (useGpu, _language) => ({
      engine: 'parakeet',
      modelType: 'tdt' as const,
      modelSrc: { src: PARAKEET_HTTP.encoderFp32 },
      encoderDataSrc: { src: PARAKEET_HTTP.encoderDataFp32 },
      decoderSrc: { src: PARAKEET_HTTP.decoderFp32 },
      preprocessorSrc: { src: PARAKEET_HTTP.preprocessor },
      vocabSrc: { src: PARAKEET_HTTP.vocab },
      useGpu,
    }),
  },
};

export const DEFAULT_STT_PROFILE_ID = 'parakeet_tdt_int8';

// ─── LLM Profiles ─────────────────────────────────────────────────────────────

export interface LlmProfile {
  id: string;
  label: string;
  estimatedBytes: number;
  buildLoadConfig: (
    useGpu: boolean,
    temperature: number,
    maxTokens: number,
  ) => LlmLoadConfig;
  buildHttpFallbackConfig?: (
    useGpu: boolean,
    temperature: number,
    maxTokens: number,
  ) => LlmLoadConfig;
}

export const LLM_PROFILES: Record<string, LlmProfile> = {
  qwen3_1_7b: {
    id: 'qwen3_1_7b',
    label: 'Qwen3 1.7B Q4 (~1.1 GB)',
    estimatedBytes: 1_100_000_000,
    buildLoadConfig: (useGpu, temperature, maxTokens) => ({
      modelConstant: QWEN3_1_7B_INST_Q4,
      contextSize: AppConfig.llm.contextSize,
      temperature,
      maxTokens,
      useGpu,
      noThink: true,
    }),
    buildHttpFallbackConfig: (useGpu, temperature, maxTokens) => ({
      modelConstant: { src: QWEN3_HTTP.q4, modelId: 'Qwen3-1.7B-Q4_0.gguf' },
      contextSize: AppConfig.llm.contextSize,
      temperature,
      maxTokens,
      useGpu,
      noThink: true,
    }),
  },
  qwen3_4b: {
    id: 'qwen3_4b',
    label: 'Qwen3 4B Q4 (~2.5 GB)',
    estimatedBytes: 2_500_000_000,
    buildLoadConfig: (useGpu, temperature, maxTokens) => ({
      modelConstant: QWEN3_4B_INST_Q4_K_M,
      contextSize: AppConfig.llm.contextSize,
      temperature,
      maxTokens,
      useGpu,
      noThink: true,
    }),
  },
};

export const DEFAULT_LLM_PROFILE_ID = 'qwen3_1_7b';

// ─── TTS Profiles ─────────────────────────────────────────────────────────────

export interface TtsProfile {
  id: string;
  label: string;
  estimatedBytes: number;
  sampleRate: number;
  buildLoadConfig: (
    useGpu: boolean,
    speed: number,
    language: 'en' | 'ko' | 'es' | 'pt' | 'fr',
  ) => TtsLoadConfig;
  buildHttpFallbackConfig?: (
    useGpu: boolean,
    speed: number,
    language: 'en' | 'ko' | 'es' | 'pt' | 'fr',
  ) => TtsLoadConfig;
}

export const TTS_PROFILES: Record<string, TtsProfile> = {
  supertonic2: {
    id: 'supertonic2',
    label: 'Supertonic 2 TTS — multilingual (~265 MB)',
    // Sum of FP32 component sizes (text encoder + duration predictor +
    // vector estimator + vocoder + unicode indexer + tts config + voice style).
    estimatedBytes: 263_000_000,
    sampleRate: 44100,
    buildLoadConfig: (useGpu, speed, language) => ({
      textEncoderSrc: TTS_SUPERTONIC2_OFFICIAL_TEXT_ENCODER_SUPERTONE_FP32.src,
      durationPredictorSrc: TTS_SUPERTONIC2_OFFICIAL_DURATION_PREDICTOR_SUPERTONE_FP32.src,
      vectorEstimatorSrc: TTS_SUPERTONIC2_OFFICIAL_VECTOR_ESTIMATOR_SUPERTONE_FP32.src,
      vocoderSrc: TTS_SUPERTONIC2_OFFICIAL_VOCODER_SUPERTONE_FP32.src,
      unicodeIndexerSrc: TTS_SUPERTONIC2_OFFICIAL_UNICODE_INDEXER_SUPERTONE_FP32.src,
      ttsConfigSrc: TTS_SUPERTONIC2_OFFICIAL_TTS_CONFIG_SUPERTONE.src,
      voiceStyleSrc: TTS_SUPERTONIC2_OFFICIAL_VOICE_STYLE_SUPERTONE.src,
      language,
      speed,
      sampleRate: 44100,
      useGpu,
      numInferenceSteps: 5,
      supertonicMultilingual: true,
      httpFallback: {
        textEncoderSrc: SUPERTONIC_HTTP.textEncoder,
        durationPredictorSrc: SUPERTONIC_HTTP.durationPredictor,
        vectorEstimatorSrc: SUPERTONIC_HTTP.vectorEstimator,
        vocoderSrc: SUPERTONIC_HTTP.vocoder,
        unicodeIndexerSrc: SUPERTONIC_HTTP.unicodeIndexer,
        ttsConfigSrc: SUPERTONIC_HTTP.ttsConfig,
        voiceStyleSrc: SUPERTONIC_HTTP.voiceStyle,
      },
    }),
  },
};

export const DEFAULT_TTS_PROFILE_ID = 'supertonic2';

// ─── Translator Profiles (Bergamot NMT) ──────────────────────────────────────
// Each profile is a directional pair: source -> target. Keys are BCP-47
// "<from>-<to>" strings and MUST match AppConfig.translation.supportedPairs.

export interface TranslatorProfile {
  /** Pair id, e.g. "en-it". */
  id: string;
  label: string;
  estimatedBytes: number;
  from: string;
  to: string;
  buildLoadConfig: (useGpu: boolean) => TranslatorLoadConfig;
}

// The SDK Bergamot pair models are ~20–30 MB each; vocab and shortlist files
// are auto-derived from modelSrc, so only one constant is needed per pair.
function bergamotProfile(
  id: string,
  label: string,
  from: string,
  to: string,
  modelConstant: { src: string; modelId: string },
): TranslatorProfile {
  return {
    id,
    label,
    estimatedBytes: 30_000_000,
    from,
    to,
    buildLoadConfig: (useGpu) => ({
      engine: 'bergamot',
      modelConstant,
      from,
      to,
      useGpu,
    }),
  };
}

export const TRANSLATOR_PROFILES: Record<string, TranslatorProfile> = {
  'en-it': bergamotProfile('en-it', 'Bergamot EN→IT (~30 MB)', 'en', 'it', BERGAMOT_EN_IT),
  'it-en': bergamotProfile('it-en', 'Bergamot IT→EN (~30 MB)', 'it', 'en', BERGAMOT_IT_EN),
  'en-es': bergamotProfile('en-es', 'Bergamot EN→ES (~30 MB)', 'en', 'es', BERGAMOT_EN_ES),
  'es-en': bergamotProfile('es-en', 'Bergamot ES→EN (~30 MB)', 'es', 'en', BERGAMOT_ES_EN),
  'en-fr': bergamotProfile('en-fr', 'Bergamot EN→FR (~30 MB)', 'en', 'fr', BERGAMOT_EN_FR),
  'fr-en': bergamotProfile('fr-en', 'Bergamot FR→EN (~30 MB)', 'fr', 'en', BERGAMOT_FR_EN),
  'en-de': bergamotProfile('en-de', 'Bergamot EN→DE (~30 MB)', 'en', 'de', BERGAMOT_EN_DE),
  'de-en': bergamotProfile('de-en', 'Bergamot DE→EN (~30 MB)', 'de', 'en', BERGAMOT_DE_EN),
  'en-pt': bergamotProfile('en-pt', 'Bergamot EN→PT (~30 MB)', 'en', 'pt', BERGAMOT_EN_PT),
  'pt-en': bergamotProfile('pt-en', 'Bergamot PT→EN (~30 MB)', 'pt', 'en', BERGAMOT_PT_EN),
};

export function getTranslatorProfileId(from: string, to: string): string {
  return `${from}-${to}`;
}
