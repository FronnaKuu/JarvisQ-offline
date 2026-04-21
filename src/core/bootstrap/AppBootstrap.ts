// ---- App Bootstrap --------------------------------------------------------
// Platform-agnostic orchestrator that brings inference services to a ready
// state. Loading is split in two phases:
//
//   1. ensureAlwaysOn() — STT + TTS. Both modes (conversation, translation)
//      need these, so they load once at app start.
//   2. ensureResponderReady(mode, opts) — the mode-specific responder:
//      LLM for conversation chats, Bergamot NMT for translation chats. Runs
//      lazily the first time the user enters a chat of that mode (or when
//      the translation pair changes).
//
// UI layers subscribe through BootstrapStore and do not depend on this class
// directly. Moving this logic into core keeps it reusable by any future
// target (desktop shell, CLI, test harness).

import {
  STT_PROFILES,
  LLM_PROFILES,
  TTS_PROFILES,
  TRANSLATOR_PROFILES,
  DEFAULT_STT_PROFILE_ID,
  DEFAULT_LLM_PROFILE_ID,
  DEFAULT_TTS_PROFILE_ID,
  getTranslatorProfileId,
} from '@core/config/ModelConfig';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';
import { TranslatorService } from '@core/inference/TranslatorService';
import { getPlatform } from '@core/platform/PlatformContainer';
import type { AppSettings, ConversationMode } from '@domain/types';
import type { ModelProgressUpdate } from '@qvac/sdk';

export type ServiceKind = 'stt' | 'llm' | 'tts' | 'translator';

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

export interface ResponderLoadOptions {
  /** Only used when mode === 'translation'. */
  sourceLang?: string | null;
  /** Only used when mode === 'translation'. */
  targetLang?: string | null;
}

function toSnapshot(p: ModelProgressUpdate): ServiceProgressSnapshot {
  return {
    bytesDownloaded: p.downloaded,
    totalBytes: p.total,
    percentage: p.percentage,
  };
}

export class AppBootstrap {
  /** Loads the services needed regardless of conversation mode: STT + TTS. */
  async ensureAlwaysOn(
    settings: AppSettings,
    modelIds: BootstrapModelIds,
    handlers: BootstrapHandlers = {},
  ): Promise<void> {
    const sttProfile =
      STT_PROFILES[modelIds.sttModelId] ?? STT_PROFILES[DEFAULT_STT_PROFILE_ID]!;
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

    if (settings.ttsEngine === 'system') {
      handlers.onServiceStart?.('tts', 'System TTS');
      handlers.onServiceDone?.('tts');
    } else if (!TtsService.isLoaded) {
      handlers.onServiceStart?.('tts', ttsProfile.label);
      await TtsService.load(
        ttsProfile.buildLoadConfig(settings.useGpu, settings.ttsSpeed, 'en'),
        { fileSystem: getPlatform().fileSystem },
        (p) => handlers.onServiceProgress?.('tts', toSnapshot(p)),
      );
      handlers.onServiceDone?.('tts');
    }
  }

  /**
   * Loads the responder matching the chat mode. For 'conversation' this is
   * the configured LLM; for 'translation' this is the Bergamot NMT pair
   * derived from (sourceLang, targetLang). Re-entrant: a no-op when the
   * correct model is already loaded; unloads + reloads when the translation
   * direction changes.
   */
  async ensureResponderReady(
    mode: ConversationMode,
    settings: AppSettings,
    modelIds: BootstrapModelIds,
    opts: ResponderLoadOptions = {},
    handlers: BootstrapHandlers = {},
  ): Promise<void> {
    if (mode === 'conversation') {
      const llmProfile =
        LLM_PROFILES[modelIds.llmModelId] ??
        LLM_PROFILES[DEFAULT_LLM_PROFILE_ID]!;

      if (LlmService.isLoaded) return;

      handlers.onServiceStart?.('llm', llmProfile.label);
      await LlmService.load(
        llmProfile.buildLoadConfig(
          settings.useGpu,
          settings.llmTemperature,
          settings.llmMaxTokens,
        ),
        (p) => handlers.onServiceProgress?.('llm', toSnapshot(p)),
        llmProfile.buildHttpFallbackConfig?.(
          settings.useGpu,
          settings.llmTemperature,
          settings.llmMaxTokens,
        ),
      );
      handlers.onServiceDone?.('llm');
      return;
    }

    // Translation mode — resolve the Bergamot pair profile.
    const from = opts.sourceLang ?? settings.translationSourceLang;
    const to = opts.targetLang ?? settings.translationTargetLang;
    const pairId = getTranslatorProfileId(from, to);
    const profile = TRANSLATOR_PROFILES[pairId];
    if (!profile) {
      throw new Error(
        `No Bergamot translator profile for pair ${pairId}. See AppConfig.translation.supportedPairs.`,
      );
    }

    // Already loaded in the right direction? nothing to do.
    const currentDir = TranslatorService.direction;
    if (
      TranslatorService.isLoaded &&
      currentDir?.from === from &&
      currentDir?.to === to
    ) {
      return;
    }

    handlers.onServiceStart?.('translator', profile.label);
    await TranslatorService.load(
      profile.buildLoadConfig(settings.useGpu),
      (p) => handlers.onServiceProgress?.('translator', toSnapshot(p)),
    );
    handlers.onServiceDone?.('translator');
  }

  profileLabels(
    modelIds: BootstrapModelIds,
  ): Record<ServiceKind, string> {
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
      translator: 'Bergamot translator',
    };
  }
}
