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
// Offline-first: the LLM responder is loaded cache-first — the SDK resolves
// the model from its on-disk cache with ZERO network I/O on repeat launches.
// Only when the blob is missing (first install, cache eviction) do we retry
// through the network paths (QVAC P2P registry, then HTTPS fallback). Pass
// `offlineOnly: true` in ResponderLoadOptions to forbid that network retry.
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
  resolveTranslatorPair,
} from '@core/config/ModelConfig';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';
import { TranslatorService } from '@core/inference/TranslatorService';
import { getPlatform } from '@core/platform/PlatformContainer';
import type { AppSettings, ConversationMode } from '@domain/types';
import type { ModelProgressUpdate } from '@qvac/sdk';
import type { IKeyValueStore } from '@core/ports/IKeyValueStore';

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
  /**
   * Offline-first hint. When true the responder is loaded from the local
   * model cache only and the network retry (P2P + HTTPS fallback) is
   * forbidden — any load failure propagates immediately. Omit (or pass
   * false) on first install so a cache miss falls back to downloading.
   */
  offlineOnly?: boolean;
}

function toSnapshot(p: ModelProgressUpdate): ServiceProgressSnapshot {
  return {
    bytesDownloaded: p.downloaded,
    totalBytes: p.total,
    percentage: p.percentage,
  };
}

// ─── Offline-ready markers ─────────────────────────────────────────────────
// 每次模型加载成功后持久化一个标记，平台层通过它判断"模型是否已全部下载"，
// 从而跳过连通性探测（见 FetchNetworkInfo 的 isLocallyReady 钩子）。
const MODEL_READY_KEY_PREFIX = 'model.ready.';

function readyKey(kind: ServiceKind): string {
  return `${MODEL_READY_KEY_PREFIX}${kind}`;
}

function keyValueStore(): IKeyValueStore | null {
  const platform = getPlatform() as { keyValueStore?: IKeyValueStore };
  return platform.keyValueStore ?? null;
}

async function persistModelReady(kind: ServiceKind): Promise<void> {
  try {
    await keyValueStore()?.setItem(readyKey(kind), '1');
  } catch (err) {
    // 非致命：标记写失败的话下次启动最多重新探测一次。
    console.warn(`[AppBootstrap] failed to persist ready marker for "${kind}"`, err);
  }
}

/**
 * 所有必需服务（STT/TTS/LLM）是否都已下载完成。被平台层网络探测器的
 * isLocallyReady 钩子消费，使重复启动完全跳过联网检查。
 */
export async function modelsReadyLocally(): Promise<boolean> {
  const kv = keyValueStore();
  if (!kv) return false;
  const values = await Promise.all(
    (['stt', 'llm', 'tts'] as const).map((kind) => kv.getItem(readyKey(kind))),
  );
  return values.every((v) => v === '1');
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

    if (!SttService.isLoaded) {
      handlers.onServiceStart?.('stt', sttProfile.label);
      await SttService.load(
        sttProfile.buildLoadConfig(settings.useGpu, settings.sttLanguage),
        (p) => handlers.onServiceProgress?.('stt', toSnapshot(p)),
        sttProfile.buildHttpFallbackConfig?.(settings.useGpu, settings.sttLanguage),
      );
      handlers.onServiceDone?.('stt');
    }

    await this.ensureTts(settings, modelIds, handlers);
  }

  /**
   * Idempotent TTS load. Called from boot AND from the conversation screen
   * when settings.ttsEngine changes — switching from 'system' to a Supertonic
   * profile after boot would otherwise leave the model unloaded, so the first
   * synthesize() throws "TTS model not loaded" and Retry can't recover.
   */
  async ensureTts(
    settings: AppSettings,
    modelIds: BootstrapModelIds,
    handlers: BootstrapHandlers = {},
  ): Promise<void> {
    if (settings.ttsEngine === 'system') {
      handlers.onServiceStart?.('tts', 'System TTS');
      handlers.onServiceDone?.('tts');
      return;
    }
    if (TtsService.isLoaded) return;
    const ttsProfile =
      TTS_PROFILES[modelIds.ttsModelId] ?? TTS_PROFILES[DEFAULT_TTS_PROFILE_ID]!;
    handlers.onServiceStart?.('tts', ttsProfile.label);
    await TtsService.load(
      ttsProfile.buildLoadConfig(settings.useGpu, settings.ttsSpeed, 'en'),
      { fileSystem: getPlatform().fileSystem },
      (p) => handlers.onServiceProgress?.('tts', toSnapshot(p)),
    );
    handlers.onServiceDone?.('tts');
  }

  /**
   * Loads the responder matching the chat mode. For 'conversation' this is
   * the configured LLM; for 'translation' this is the Bergamot NMT pair
   * derived from (sourceLang, targetLang). Re-entrant: a no-op when the
   * correct model is already loaded; unloads + reloads when the translation
   * direction changes.
   *
   * Offline-first for the LLM: a cache-only load is attempted first (zero
   * network I/O when the blob is already on disk — the repeat-launch case);
   * the P2P/HTTPS fallback only runs when that cache miss signals the model
   * was never downloaded or was evicted.
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

      // Free the translator's RAM before bringing the LLM up — the two
      // responders are mutually exclusive per chat mode.
      if (TranslatorService.isLoaded) await TranslatorService.unload();

      if (LlmService.isLoaded) return;

      handlers.onServiceStart?.('llm', llmProfile.label);
      const progress = (p: ModelProgressUpdate) =>
        handlers.onServiceProgress?.('llm', toSnapshot(p));
      const buildConfig = () =>
        llmProfile.buildLoadConfig(
          settings.useGpu,
          settings.llmTemperature,
          settings.llmMaxTokens,
        );
      const httpFallback = llmProfile.buildHttpFallbackConfig?.(
        settings.useGpu,
        settings.llmTemperature,
        settings.llmMaxTokens,
      );

      try {
        // Cache-first pass: no P2P discovery, no HTTPS fallback, no probe.
        const localConfig = buildConfig();
        localConfig.offline = true;
        await LlmService.load(localConfig, progress);
      } catch (err) {
        if (opts.offlineOnly) throw err;
        // Blob missing (first install / cache evicted) — retry with the
        // network paths (QVAC P2P registry, then HTTPS fallback).
        console.warn(
          '[AppBootstrap] LLM not found in local cache, loading via network…',
          err,
        );
        await LlmService.load(buildConfig(), progress, httpFallback);
      }
      handlers.onServiceDone?.('llm');
      return;
    }

    // Translation mode — route the (from, to) pair to a direct Bergamot model
    // or a two-leg pivot through English.
    const from = opts.sourceLang ?? settings.translationSourceLang;
    const to = opts.targetLang ?? settings.translationTargetLang;
    const resolved = resolveTranslatorPair(from, to);
    if (resolved.kind === 'unsupported') {
      throw new Error(
        `No Bergamot translation route from "${from}" to "${to}". Some languages (be, bs, mt, nb, nn, sr, vi) have no EN→X model and cannot be used as target.`,
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

    // Free the LLM's RAM before bringing the translator up.
    if (LlmService.isLoaded) await LlmService.unload();

    const label =
      resolved.kind === 'direct'
        ? resolved.profile.label
        : `Bergamot ${from.toUpperCase()}→EN→${to.toUpperCase()} (pivot, ~60 MB)`;
    handlers.onServiceStart?.('translator', label);

    const loadConfig =
      resolved.kind === 'direct'
        ? resolved.profile.buildLoadConfig(settings.useGpu)
        : {
            engine: 'bergamot-pivot' as const,
            from,
            to,
            useGpu: settings.useGpu,
            leg1: {
              modelConstant: resolved.leg1.modelConstant,
              from: resolved.leg1.from,
              to: resolved.leg1.to,
              useGpu: settings.useGpu,
            },
            leg2: {
              modelConstant: resolved.leg2.modelConstant,
              from: resolved.leg2.from,
              to: resolved.leg2.to,
              useGpu: settings.useGpu,
            },
          };

    await TranslatorService.load(loadConfig, (p) =>
      handlers.onServiceProgress?.('translator', toSnapshot(p)),
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
