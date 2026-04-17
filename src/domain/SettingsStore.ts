// ─── Settings Store (Zustand) ────────────────────────────────────────────────
// Persists user preferences through the IKeyValueStore port. The concrete KV
// adapter is resolved from the platform container, so the store stays free of
// platform-specific imports.

import { create } from 'zustand';
import type { AppSettings } from './types';
import { AppConfig } from '@core/config/AppConfig';
import { getPlatform } from '@core/platform/PlatformContainer';
import {
  DEFAULT_STT_PROFILE_ID,
  DEFAULT_LLM_PROFILE_ID,
  DEFAULT_TTS_PROFILE_ID,
} from '@core/config/ModelConfig';

const SETTINGS_KEY = 'jarvisqvac_settings';
const MODEL_IDS_KEY = 'jarvisqvac_model_ids';

interface ModelIds {
  sttModelId: string;
  llmModelId: string;
  ttsModelId: string;
}

interface SettingsStore {
  settings: AppSettings;
  modelIds: ModelIds;
  isLoaded: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (fields: Partial<AppSettings>) => Promise<void>;
  updateModelIds: (ids: Partial<ModelIds>) => Promise<void>;
}

const defaultSettings: AppSettings = {
  sttLanguage: AppConfig.stt.defaultLanguage,
  llmSystemPrompt: AppConfig.conversation.defaultSystemPrompt,
  llmTemperature: AppConfig.llm.defaultTemperature,
  llmMaxTokens: AppConfig.llm.defaultMaxTokens,
  ttsVoice: AppConfig.tts.defaultVoice,
  ttsSpeed: AppConfig.tts.defaultSpeed,
  ttsPitch: AppConfig.tts.defaultPitch,
  ttsEngine: AppConfig.tts.defaultEngine,
  ttsBufferMode: AppConfig.tts.defaultBufferMode,
  ttsSystemLanguage: AppConfig.tts.defaultSystemLanguage,
  useGpu: true,
};

const defaultModelIds: ModelIds = {
  sttModelId: DEFAULT_STT_PROFILE_ID,
  llmModelId: DEFAULT_LLM_PROFILE_ID,
  ttsModelId: DEFAULT_TTS_PROFILE_ID,
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaultSettings,
  modelIds: defaultModelIds,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const [rawSettings, rawIds] = await Promise.all([
        getPlatform().keyValueStore.getItem(SETTINGS_KEY),
        getPlatform().keyValueStore.getItem(MODEL_IDS_KEY),
      ]);
      const settings = rawSettings
        ? { ...defaultSettings, ...(JSON.parse(rawSettings) as Partial<AppSettings>) }
        : defaultSettings;
      const modelIds = rawIds
        ? { ...defaultModelIds, ...(JSON.parse(rawIds) as Partial<ModelIds>) }
        : defaultModelIds;
      set({ settings, modelIds, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  updateSettings: async (fields) => {
    const next = { ...get().settings, ...fields };
    await getPlatform().keyValueStore.setItem(SETTINGS_KEY, JSON.stringify(next));
    set({ settings: next });
  },

  updateModelIds: async (ids) => {
    const next = { ...get().modelIds, ...ids };
    await getPlatform().keyValueStore.setItem(MODEL_IDS_KEY, JSON.stringify(next));
    set({ modelIds: next });
  },
}));
