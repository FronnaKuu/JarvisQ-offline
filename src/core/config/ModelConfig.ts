// ─── Model Configuration ─────────────────────────────────────────────────────
// Centralizes model selection and load parameters using @qvac/sdk model registry.
// All model constants come from the SDK — no manual URLs or file management needed.

import {
  WHISPER_BASE_Q8_0,
  WHISPER_TINY_Q8_0,
  QWEN3_1_7B_INST_Q4,
  QWEN3_4B_INST_Q4_K_M,
  TTS_TOKENIZER_SUPERTONIC,
  TTS_TEXT_ENCODER_SUPERTONIC_FP32,
  TTS_LATENT_DENOISER_SUPERTONIC_FP32,
  TTS_VOICE_DECODER_SUPERTONIC_FP32,
  TTS_VOICE_STYLE_SUPERTONIC,
} from '@qvac/sdk';
import { AppConfig } from './AppConfig';
import type { SttLoadConfig } from '@core/inference/SttService';
import type { LlmLoadConfig } from '@core/inference/LlmService';
import type { TtsLoadConfig } from '@core/inference/TtsService';

// ─── STT Profiles ─────────────────────────────────────────────────────────────

export interface SttProfile {
  id: string;
  label: string;
  estimatedBytes: number;
  buildLoadConfig: (useGpu: boolean, language: string) => SttLoadConfig;
}

export const STT_PROFILES: Record<string, SttProfile> = {
  whisper_base: {
    id: 'whisper_base',
    label: 'Whisper Base Q8 (~150 MB)',
    estimatedBytes: 153_000_000,
    buildLoadConfig: (useGpu, language) => ({
      modelConstant: WHISPER_BASE_Q8_0,
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
    buildLoadConfig: (useGpu, language) => ({
      modelConstant: WHISPER_TINY_Q8_0,
      language,
      nThreads: AppConfig.stt.nThreads,
      vadThreshold: AppConfig.stt.vadThreshold,
      vadMinSpeechDurationMs: AppConfig.stt.vadMinSpeechDurationMs,
      vadMinSilenceDurationMs: AppConfig.stt.vadMinSilenceDurationMs,
      useGpu,
    }),
  },
};

export const DEFAULT_STT_PROFILE_ID = 'whisper_base';

// ─── LLM Profiles ─────────────────────────────────────────────────────────────

export interface LlmProfile {
  id: string;
  label: string;
  estimatedBytes: number;
  buildLoadConfig: (
    useGpu: boolean,
    systemPrompt: string,
    temperature: number,
    maxTokens: number,
  ) => LlmLoadConfig;
}

export const LLM_PROFILES: Record<string, LlmProfile> = {
  qwen3_1_7b: {
    id: 'qwen3_1_7b',
    label: 'Qwen3 1.7B Q4 (~1.1 GB)',
    estimatedBytes: 1_100_000_000,
    buildLoadConfig: (useGpu, systemPrompt, temperature, maxTokens) => ({
      modelConstant: QWEN3_1_7B_INST_Q4,
      contextSize: AppConfig.llm.contextSize,
      temperature,
      maxTokens,
      systemPrompt,
      useGpu,
    }),
  },
  qwen3_4b: {
    id: 'qwen3_4b',
    label: 'Qwen3 4B Q4 (~2.5 GB)',
    estimatedBytes: 2_500_000_000,
    buildLoadConfig: (useGpu, systemPrompt, temperature, maxTokens) => ({
      modelConstant: QWEN3_4B_INST_Q4_K_M,
      contextSize: AppConfig.llm.contextSize,
      temperature,
      maxTokens,
      systemPrompt,
      useGpu,
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
    language: 'en' | 'de' | 'es' | 'it',
  ) => TtsLoadConfig;
}

export const TTS_PROFILES: Record<string, TtsProfile> = {
  supertonic_en: {
    id: 'supertonic_en',
    label: 'Supertonic TTS (~180 MB)',
    estimatedBytes: 182_000_000,
    sampleRate: 44100,
    buildLoadConfig: (useGpu, speed, language) => ({
      tokenizerSrc: TTS_TOKENIZER_SUPERTONIC.src,
      textEncoderSrc: TTS_TEXT_ENCODER_SUPERTONIC_FP32.src,
      latentDenoiserSrc: TTS_LATENT_DENOISER_SUPERTONIC_FP32.src,
      voiceDecoderSrc: TTS_VOICE_DECODER_SUPERTONIC_FP32.src,
      voiceSrc: TTS_VOICE_STYLE_SUPERTONIC.src,
      language,
      speed,
      sampleRate: 44100,
      useGpu,
    }),
  },
};

export const DEFAULT_TTS_PROFILE_ID = 'supertonic_en';
