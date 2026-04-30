// ---- Bootstrap Store (Zustand) -------------------------------------------
// Reactive wrapper around AppBootstrap. Any UI (mobile screens, desktop
// shell) can subscribe to the aggregate phase and per-service progress
// without importing core directly.

import { create } from 'zustand';
import { AppBootstrap } from '@core/bootstrap/AppBootstrap';
import type {
  BootstrapHandlers,
  ResponderLoadOptions,
  ServiceKind,
  ServiceProgressSnapshot,
} from '@core/bootstrap/AppBootstrap';
import type { ConversationMode } from './types';
import { useSettingsStore } from './SettingsStore';
import { useConversationStore } from './ConversationStore';

export type BootstrapPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error';

export interface ServiceStatus {
  label: string;
  phase: 'pending' | 'active' | 'done';
  progress: ServiceProgressSnapshot | null;
}

interface BootstrapState {
  phase: BootstrapPhase;
  errorMessage: string | null;
  services: Record<ServiceKind, ServiceStatus>;
  /**
   * Loads the always-on services (STT + TTS). Does NOT auto-create a
   * conversation — the mode picker is responsible for that, so the first
   * launch flow becomes: bootstrap → mode picker → chat.
   */
  start: () => Promise<void>;
  /**
   * Loads the responder needed for `mode` (LLM or Bergamot NMT). Called by
   * the conversation screen before arming the pipeline. Safe to call
   * repeatedly — a no-op when the correct model is already loaded.
   */
  ensureResponder: (
    mode: ConversationMode,
    opts?: ResponderLoadOptions,
  ) => Promise<void>;
  /**
   * Idempotent TTS load. Conversation screen calls this when settings.ttsEngine
   * changes — boot only loads what was selected at startup, so switching
   * engine after boot needs a follow-up load.
   */
  ensureTts: () => Promise<void>;
  reset: () => void;
}

const bootstrap = new AppBootstrap();

function initialServices(): Record<ServiceKind, ServiceStatus> {
  const blank: ServiceStatus = { label: '', phase: 'pending', progress: null };
  return {
    stt: { ...blank },
    llm: { ...blank },
    tts: { ...blank },
    translator: { ...blank },
  };
}

export const useBootstrapStore = create<BootstrapState>((set, get) => ({
  phase: 'idle',
  errorMessage: null,
  services: initialServices(),

  start: async () => {
    if (get().phase === 'loading') return;

    const settings = useSettingsStore.getState().settings;
    const modelIds = useSettingsStore.getState().modelIds;
    const labels = bootstrap.profileLabels(modelIds);

    set({
      phase: 'loading',
      errorMessage: null,
      services: {
        stt: { label: labels.stt, phase: 'pending', progress: null },
        // llm + translator stay pending — they are loaded lazily when the
        // user enters a chat of the matching mode.
        llm: { label: labels.llm, phase: 'pending', progress: null },
        tts: { label: labels.tts, phase: 'pending', progress: null },
        translator: { label: labels.translator, phase: 'pending', progress: null },
      },
    });

    const handlers: BootstrapHandlers = {
      onServiceStart: (kind, label) => {
        set((s) => ({
          services: {
            ...s.services,
            [kind]: { ...s.services[kind], label, phase: 'active' },
          },
        }));
      },
      onServiceProgress: (kind, progress) => {
        set((s) => ({
          services: {
            ...s.services,
            [kind]: { ...s.services[kind], progress },
          },
        }));
      },
      onServiceDone: (kind) => {
        set((s) => ({
          services: {
            ...s.services,
            [kind]: { ...s.services[kind], phase: 'done' },
          },
        }));
      },
    };

    try {
      await bootstrap.ensureAlwaysOn(settings, modelIds, handlers);

      const conversationStore = useConversationStore.getState();
      if (
        conversationStore.conversations.length > 0 &&
        !conversationStore.activeConversationId
      ) {
        const first = conversationStore.conversations[0];
        if (first) await conversationStore.selectConversation(first.id);
      }

      set({ phase: 'ready' });
    } catch (err) {
      set({
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  },

  ensureResponder: async (mode, opts = {}) => {
    const settings = useSettingsStore.getState().settings;
    const modelIds = useSettingsStore.getState().modelIds;

    const handlers: BootstrapHandlers = {
      onServiceStart: (kind, label) => {
        set((s) => ({
          services: {
            ...s.services,
            [kind]: { ...s.services[kind], label, phase: 'active' },
          },
        }));
      },
      onServiceProgress: (kind, progress) => {
        set((s) => ({
          services: {
            ...s.services,
            [kind]: { ...s.services[kind], progress },
          },
        }));
      },
      onServiceDone: (kind) => {
        set((s) => ({
          services: {
            ...s.services,
            [kind]: { ...s.services[kind], phase: 'done' },
          },
        }));
      },
    };

    await bootstrap.ensureResponderReady(mode, settings, modelIds, opts, handlers);
  },

  ensureTts: async () => {
    const settings = useSettingsStore.getState().settings;
    const modelIds = useSettingsStore.getState().modelIds;

    const handlers: BootstrapHandlers = {
      onServiceStart: (kind, label) => {
        set((s) => ({
          services: {
            ...s.services,
            [kind]: { ...s.services[kind], label, phase: 'active' },
          },
        }));
      },
      onServiceProgress: (kind, progress) => {
        set((s) => ({
          services: {
            ...s.services,
            [kind]: { ...s.services[kind], progress },
          },
        }));
      },
      onServiceDone: (kind) => {
        set((s) => ({
          services: {
            ...s.services,
            [kind]: { ...s.services[kind], phase: 'done' },
          },
        }));
      },
    };

    await bootstrap.ensureTts(settings, modelIds, handlers);
  },

  reset: () => set({
    phase: 'idle',
    errorMessage: null,
    services: initialServices(),
  }),
}));
