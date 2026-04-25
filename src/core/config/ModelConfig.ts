// ─── Model Configuration ─────────────────────────────────────────────────────
// Centralizes model selection, load parameters, and HTTPS fallback URLs.
// Primary sources use the @qvac/sdk registry (P2P). Each profile also provides
// an HTTP fallback configuration for resilience when P2P peers are unavailable.

import {
  BERGAMOT_EN_AR, BERGAMOT_AR_EN,
  BERGAMOT_EN_AZ, BERGAMOT_AZ_EN,
  BERGAMOT_BE_EN,
  BERGAMOT_EN_BG, BERGAMOT_BG_EN,
  BERGAMOT_EN_BN, BERGAMOT_BN_EN,
  BERGAMOT_BS_EN,
  BERGAMOT_EN_CA, BERGAMOT_CA_EN,
  BERGAMOT_EN_CS, BERGAMOT_CS_EN,
  BERGAMOT_EN_DA, BERGAMOT_DA_EN,
  BERGAMOT_EN_DE, BERGAMOT_DE_EN,
  BERGAMOT_EN_EL, BERGAMOT_EL_EN,
  BERGAMOT_EN_ES, BERGAMOT_ES_EN,
  BERGAMOT_EN_ET, BERGAMOT_ET_EN,
  BERGAMOT_EN_FA, BERGAMOT_FA_EN,
  BERGAMOT_EN_FI, BERGAMOT_FI_EN,
  BERGAMOT_EN_FR, BERGAMOT_FR_EN,
  BERGAMOT_EN_GU, BERGAMOT_GU_EN,
  BERGAMOT_EN_HE, BERGAMOT_HE_EN,
  BERGAMOT_EN_HI, BERGAMOT_HI_EN,
  BERGAMOT_EN_HR, BERGAMOT_HR_EN,
  BERGAMOT_EN_HU, BERGAMOT_HU_EN,
  BERGAMOT_EN_ID, BERGAMOT_ID_EN,
  BERGAMOT_EN_IS, BERGAMOT_IS_EN,
  BERGAMOT_EN_IT, BERGAMOT_IT_EN,
  BERGAMOT_EN_JA, BERGAMOT_JA_EN,
  BERGAMOT_EN_KN, BERGAMOT_KN_EN,
  BERGAMOT_EN_KO, BERGAMOT_KO_EN,
  BERGAMOT_EN_LT, BERGAMOT_LT_EN,
  BERGAMOT_EN_LV, BERGAMOT_LV_EN,
  BERGAMOT_EN_ML, BERGAMOT_ML_EN,
  BERGAMOT_EN_MS, BERGAMOT_MS_EN,
  BERGAMOT_MT_EN,
  BERGAMOT_NB_EN,
  BERGAMOT_EN_NL, BERGAMOT_NL_EN,
  BERGAMOT_NN_EN,
  BERGAMOT_EN_PL, BERGAMOT_PL_EN,
  BERGAMOT_EN_PT, BERGAMOT_PT_EN,
  BERGAMOT_EN_RO, BERGAMOT_RO_EN,
  BERGAMOT_EN_RU, BERGAMOT_RU_EN,
  BERGAMOT_EN_SK, BERGAMOT_SK_EN,
  BERGAMOT_EN_SL, BERGAMOT_SL_EN,
  BERGAMOT_EN_SQ, BERGAMOT_SQ_EN,
  BERGAMOT_SR_EN,
  BERGAMOT_EN_SV, BERGAMOT_SV_EN,
  BERGAMOT_EN_TA, BERGAMOT_TA_EN,
  BERGAMOT_EN_TE, BERGAMOT_TE_EN,
  BERGAMOT_EN_TR, BERGAMOT_TR_EN,
  BERGAMOT_EN_UK, BERGAMOT_UK_EN,
  BERGAMOT_VI_EN,
  BERGAMOT_EN_ZH, BERGAMOT_ZH_EN,
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
  SILERO_VAD_HTTP,
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
      ...(AppConfig.stt.parakeetStreamingEnabled
        ? {
            vadModelSrc: { src: SILERO_VAD_HTTP.vad },
            streamingVadParams: AppConfig.stt.streamingVad,
          }
        : {}),
      maxThreads: AppConfig.stt.parakeetMaxThreads,
      useGpu,
    }),
    buildHttpFallbackConfig: (useGpu, _language) => ({
      engine: 'parakeet',
      modelType: 'tdt' as const,
      modelSrc: { src: PARAKEET_HTTP.encoderInt8 },
      decoderSrc: { src: PARAKEET_HTTP.decoderInt8 },
      preprocessorSrc: { src: PARAKEET_HTTP.preprocessor },
      vocabSrc: { src: PARAKEET_HTTP.vocab },
      ...(AppConfig.stt.parakeetStreamingEnabled
        ? {
            vadModelSrc: { src: SILERO_VAD_HTTP.vad },
            streamingVadParams: AppConfig.stt.streamingVad,
          }
        : {}),
      maxThreads: AppConfig.stt.parakeetMaxThreads,
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
      ...(AppConfig.stt.parakeetStreamingEnabled
        ? {
            vadModelSrc: { src: SILERO_VAD_HTTP.vad },
            streamingVadParams: AppConfig.stt.streamingVad,
          }
        : {}),
      maxThreads: AppConfig.stt.parakeetMaxThreads,
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
      ...(AppConfig.stt.parakeetStreamingEnabled
        ? {
            vadModelSrc: { src: SILERO_VAD_HTTP.vad },
            streamingVadParams: AppConfig.stt.streamingVad,
          }
        : {}),
      maxThreads: AppConfig.stt.parakeetMaxThreads,
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
// "<from>-<to>" strings. The catalog is generated from BERGAMOT_LANG_MAP so
// adding a new language to the SDK registry only requires one line below.
// Cross-language pairs that have no direct model (e.g. it→de) are resolved at
// load time in AppBootstrap by pivoting through English — all non-English
// languages with both a `toEn` and `fromEn` entry here are valid pivot hops.

type ModelConstant = { src: string; modelId: string };

export interface TranslatorProfile {
  /** Pair id, e.g. "en-it". */
  id: string;
  label: string;
  estimatedBytes: number;
  from: string;
  to: string;
  modelConstant: ModelConstant;
  buildLoadConfig: (useGpu: boolean) => TranslatorLoadConfig;
}

// One entry per non-English language. `toEn` is present for every language
// the SDK ships; `fromEn` is null for languages that have no EN→X direction
// (be, bs, mt, nb, nn, sr, vi) — these can be used as source only.
const BERGAMOT_LANG_MAP: Record<string, { toEn: ModelConstant; fromEn: ModelConstant | null }> = {
  ar: { toEn: BERGAMOT_AR_EN, fromEn: BERGAMOT_EN_AR },
  az: { toEn: BERGAMOT_AZ_EN, fromEn: BERGAMOT_EN_AZ },
  be: { toEn: BERGAMOT_BE_EN, fromEn: null },
  bg: { toEn: BERGAMOT_BG_EN, fromEn: BERGAMOT_EN_BG },
  bn: { toEn: BERGAMOT_BN_EN, fromEn: BERGAMOT_EN_BN },
  bs: { toEn: BERGAMOT_BS_EN, fromEn: null },
  ca: { toEn: BERGAMOT_CA_EN, fromEn: BERGAMOT_EN_CA },
  cs: { toEn: BERGAMOT_CS_EN, fromEn: BERGAMOT_EN_CS },
  da: { toEn: BERGAMOT_DA_EN, fromEn: BERGAMOT_EN_DA },
  de: { toEn: BERGAMOT_DE_EN, fromEn: BERGAMOT_EN_DE },
  el: { toEn: BERGAMOT_EL_EN, fromEn: BERGAMOT_EN_EL },
  es: { toEn: BERGAMOT_ES_EN, fromEn: BERGAMOT_EN_ES },
  et: { toEn: BERGAMOT_ET_EN, fromEn: BERGAMOT_EN_ET },
  fa: { toEn: BERGAMOT_FA_EN, fromEn: BERGAMOT_EN_FA },
  fi: { toEn: BERGAMOT_FI_EN, fromEn: BERGAMOT_EN_FI },
  fr: { toEn: BERGAMOT_FR_EN, fromEn: BERGAMOT_EN_FR },
  gu: { toEn: BERGAMOT_GU_EN, fromEn: BERGAMOT_EN_GU },
  he: { toEn: BERGAMOT_HE_EN, fromEn: BERGAMOT_EN_HE },
  hi: { toEn: BERGAMOT_HI_EN, fromEn: BERGAMOT_EN_HI },
  hr: { toEn: BERGAMOT_HR_EN, fromEn: BERGAMOT_EN_HR },
  hu: { toEn: BERGAMOT_HU_EN, fromEn: BERGAMOT_EN_HU },
  id: { toEn: BERGAMOT_ID_EN, fromEn: BERGAMOT_EN_ID },
  is: { toEn: BERGAMOT_IS_EN, fromEn: BERGAMOT_EN_IS },
  it: { toEn: BERGAMOT_IT_EN, fromEn: BERGAMOT_EN_IT },
  ja: { toEn: BERGAMOT_JA_EN, fromEn: BERGAMOT_EN_JA },
  kn: { toEn: BERGAMOT_KN_EN, fromEn: BERGAMOT_EN_KN },
  ko: { toEn: BERGAMOT_KO_EN, fromEn: BERGAMOT_EN_KO },
  lt: { toEn: BERGAMOT_LT_EN, fromEn: BERGAMOT_EN_LT },
  lv: { toEn: BERGAMOT_LV_EN, fromEn: BERGAMOT_EN_LV },
  ml: { toEn: BERGAMOT_ML_EN, fromEn: BERGAMOT_EN_ML },
  ms: { toEn: BERGAMOT_MS_EN, fromEn: BERGAMOT_EN_MS },
  mt: { toEn: BERGAMOT_MT_EN, fromEn: null },
  nb: { toEn: BERGAMOT_NB_EN, fromEn: null },
  nl: { toEn: BERGAMOT_NL_EN, fromEn: BERGAMOT_EN_NL },
  nn: { toEn: BERGAMOT_NN_EN, fromEn: null },
  pl: { toEn: BERGAMOT_PL_EN, fromEn: BERGAMOT_EN_PL },
  pt: { toEn: BERGAMOT_PT_EN, fromEn: BERGAMOT_EN_PT },
  ro: { toEn: BERGAMOT_RO_EN, fromEn: BERGAMOT_EN_RO },
  ru: { toEn: BERGAMOT_RU_EN, fromEn: BERGAMOT_EN_RU },
  sk: { toEn: BERGAMOT_SK_EN, fromEn: BERGAMOT_EN_SK },
  sl: { toEn: BERGAMOT_SL_EN, fromEn: BERGAMOT_EN_SL },
  sq: { toEn: BERGAMOT_SQ_EN, fromEn: BERGAMOT_EN_SQ },
  sr: { toEn: BERGAMOT_SR_EN, fromEn: null },
  sv: { toEn: BERGAMOT_SV_EN, fromEn: BERGAMOT_EN_SV },
  ta: { toEn: BERGAMOT_TA_EN, fromEn: BERGAMOT_EN_TA },
  te: { toEn: BERGAMOT_TE_EN, fromEn: BERGAMOT_EN_TE },
  tr: { toEn: BERGAMOT_TR_EN, fromEn: BERGAMOT_EN_TR },
  uk: { toEn: BERGAMOT_UK_EN, fromEn: BERGAMOT_EN_UK },
  vi: { toEn: BERGAMOT_VI_EN, fromEn: null },
  zh: { toEn: BERGAMOT_ZH_EN, fromEn: BERGAMOT_EN_ZH },
};

function bergamotProfile(
  from: string,
  to: string,
  modelConstant: ModelConstant,
): TranslatorProfile {
  const id = `${from}-${to}`;
  return {
    id,
    label: `Bergamot ${from.toUpperCase()}→${to.toUpperCase()} (~30 MB)`,
    estimatedBytes: 30_000_000,
    from,
    to,
    modelConstant,
    buildLoadConfig: (useGpu) => ({
      engine: 'bergamot',
      modelConstant,
      from,
      to,
      useGpu,
    }),
  };
}

export const TRANSLATOR_PROFILES: Record<string, TranslatorProfile> = (() => {
  const out: Record<string, TranslatorProfile> = {};
  for (const [lang, entry] of Object.entries(BERGAMOT_LANG_MAP)) {
    out[`${lang}-en`] = bergamotProfile(lang, 'en', entry.toEn);
    if (entry.fromEn) out[`en-${lang}`] = bergamotProfile('en', lang, entry.fromEn);
  }
  return out;
})();

/** All non-English language codes usable as source (every SDK entry). */
export const BERGAMOT_SOURCE_LANGS: ReadonlyArray<string> = [
  'en',
  ...Object.keys(BERGAMOT_LANG_MAP),
];

/** Non-English languages usable as target (have an EN→X direction). */
export const BERGAMOT_TARGET_LANGS: ReadonlyArray<string> = [
  'en',
  ...Object.keys(BERGAMOT_LANG_MAP).filter((l) => BERGAMOT_LANG_MAP[l]!.fromEn !== null),
];

export type PairResolution =
  | { kind: 'direct'; profile: TranslatorProfile }
  | { kind: 'pivot'; leg1: TranslatorProfile; leg2: TranslatorProfile }
  | { kind: 'unsupported' };

/**
 * Resolves a (from, to) pair to either a direct Bergamot model or a pivot
 * via English. Returns 'unsupported' when no route exists (e.g. target is one
 * of the seven languages with no EN→X direction).
 */
export function resolveTranslatorPair(from: string, to: string): PairResolution {
  if (from === to) return { kind: 'unsupported' };
  const direct = TRANSLATOR_PROFILES[`${from}-${to}`];
  if (direct) return { kind: 'direct', profile: direct };
  if (from === 'en' || to === 'en') return { kind: 'unsupported' };
  const leg1 = TRANSLATOR_PROFILES[`${from}-en`];
  const leg2 = TRANSLATOR_PROFILES[`en-${to}`];
  if (leg1 && leg2) return { kind: 'pivot', leg1, leg2 };
  return { kind: 'unsupported' };
}
