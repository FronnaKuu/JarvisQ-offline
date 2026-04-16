// ---- Bootstrap Store (Zustand) -------------------------------------------
// Reactive wrapper around AppBootstrap. Any UI (mobile screens, desktop
// shell) can subscribe to the aggregate phase and per-service progress
// without importing core directly.

import { create } from 'zustand';
import { AppBootstrap } from '@core/bootstrap/AppBootstrap';
import type {
  BootstrapHandlers,
  ServiceKind,
  ServiceProgressSnapshot,
} from '@core/bootstrap/AppBootstrap';
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
  start: () => Promise<void>;
  reset: () => void;
}

const bootstrap = new AppBootstrap();

function initialServices(): Record<ServiceKind, ServiceStatus> {
  const blank: ServiceStatus = { label: '', phase: 'pending', progress: null };
  return { stt: { ...blank }, llm: { ...blank }, tts: { ...blank } };
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
        llm: { label: labels.llm, phase: 'pending', progress: null },
        tts: { label: labels.tts, phase: 'pending', progress: null },
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
      await bootstrap.ensureReady(settings, modelIds, handlers);

      const conversationStore = useConversationStore.getState();
      if (conversationStore.conversations.length === 0) {
        await conversationStore.createConversation();
      }

      set({ phase: 'ready' });
    } catch (err) {
      set({
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  },

  reset: () => set({
    phase: 'idle',
    errorMessage: null,
    services: initialServices(),
  }),
}));
