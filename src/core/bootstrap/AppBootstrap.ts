// ---- App Bootstrap --------------------------------------------------------
// Platform-agnostic orchestrator that brings every inference service to a
// ready state. Delegates the actual loading to SttService / LlmService /
// TtsService — the SDK reuses its on-disk cache when present, so the same
// call path covers "first install" (download) and "warm start" (cache hit).
//
// UI layers subscribe through BootstrapStore and do not depend on this class
// directly. Moving this logic into core keeps it reusable by any future
// target (desktop shell, CLI, test harness).

import {
  STT_PROFILES,
  LLM_PROFILES,
  TTS_PROFILES,
  DEFAULT_STT_PROFILE_ID,
  DEFAULT_LLM_PROFILE_ID,
  DEFAULT_TTS_PROFILE_ID,
} from '@core/config/ModelConfig';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';
import { getPlatform } from '@core/platform/PlatformContainer';
import type { AppSettings } from '@domain/types';
import type { ModelProgressUpdate } from '@qvac/sdk';

export type ServiceKind = 'stt' | 'llm' | 'tts';

export interface ServiceProgressSnapshot {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
}

export interface BootstrapHandlers {
  onServiceStart?: (kind: ServiceKind, label: string) => void;
  onServiceProgress?: (kind: ServiceKind, progress: ServiceProgressSnapshot) => void;
  onServiceDone?: (kind: ServiceKind) => void;
}

export interface BootstrapModelIds {
  sttModelId: string;
  llmModelId: string;
  ttsModelId: string;
}

function toSnapshot(p: ModelProgressUpdate): ServiceProgressSnapshot {
  return {
    bytesDownloaded: p.downloaded,
    totalBytes: p.total,
    percentage: p.percentage,
  };
}

export class AppBootstrap {
  async ensureReady(
    settings: AppSettings,
    modelIds: BootstrapModelIds,
    handlers: BootstrapHandlers = {},
  ): Promise<void> {
    const sttProfile =
      STT_PROFILES[modelIds.sttModelId] ?? STT_PROFILES[DEFAULT_STT_PROFILE_ID]!;
    const llmProfile =
      LLM_PROFILES[modelIds.llmModelId] ?? LLM_PROFILES[DEFAULT_LLM_PROFILE_ID]!;
    const ttsProfile =
      TTS_PROFILES[modelIds.ttsModelId] ?? TTS_PROFILES[DEFAULT_TTS_PROFILE_ID]!;

    if (!SttService.isLoaded) {
      handlers.onServiceStart?.('stt', sttProfile.label);
      await SttService.load(
        sttProfile.buildLoadConfig(settings.useGpu, settings.sttLanguage),
        (p) => handlers.onServiceProgress?.('stt', toSnapshot(p)),
        sttProfile.buildHttpFallbackConfig?.(settings.useGpu, settings.sttLanguage),
      );
      handlers.onServiceDone?.('stt');
    }

    if (!LlmService.isLoaded) {
      handlers.onServiceStart?.('llm', llmProfile.label);
      await LlmService.load(
        llmProfile.buildLoadConfig(
          settings.useGpu,
          settings.llmSystemPrompt,
          settings.llmTemperature,
          settings.llmMaxTokens,
        ),
        (p) => handlers.onServiceProgress?.('llm', toSnapshot(p)),
        llmProfile.buildHttpFallbackConfig?.(
          settings.useGpu,
          settings.llmSystemPrompt,
          settings.llmTemperature,
          settings.llmMaxTokens,
        ),
      );
      handlers.onServiceDone?.('llm');
    }

    if (!TtsService.isLoaded) {
      handlers.onServiceStart?.('tts', ttsProfile.label);
      await TtsService.load(
        ttsProfile.buildLoadConfig(settings.useGpu, settings.ttsSpeed, 'en'),
        { fileSystem: getPlatform().fileSystem },
        (p) => handlers.onServiceProgress?.('tts', toSnapshot(p)),
      );
      handlers.onServiceDone?.('tts');
    }
  }

  profileLabels(modelIds: BootstrapModelIds): Record<ServiceKind, string> {
    return {
      stt:
        STT_PROFILES[modelIds.sttModelId]?.label ??
        STT_PROFILES[DEFAULT_STT_PROFILE_ID]!.label,
      llm:
        LLM_PROFILES[modelIds.llmModelId]?.label ??
        LLM_PROFILES[DEFAULT_LLM_PROFILE_ID]!.label,
      tts:
        TTS_PROFILES[modelIds.ttsModelId]?.label ??
        TTS_PROFILES[DEFAULT_TTS_PROFILE_ID]!.label,
    };
  }
}
