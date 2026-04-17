// ─── Electron ↔ Renderer IPC Contract ────────────────────────────────────────
// Shared type declarations consumed by main, preload, and renderer. Only
// *types* live here — no runtime code — so renderer bundling does not drag
// Node-only symbols into Chromium.

import type { AudioRecorderState } from '@core/ports/IAudioRecorder';
import type { ServiceKind } from '@core/bootstrap/AppBootstrap';

export const AppIpcChannels = {
  // Renderer → Main (request/response via ipcRenderer.invoke)
  bootstrap: 'jarvis:bootstrap',
  sendText: 'jarvis:send-text',
  startVoice: 'jarvis:start-voice',
  stopPipeline: 'jarvis:stop-pipeline',

  // Main → Renderer (push)
  bootstrapProgress: 'jarvis:bootstrap:progress',
  bootstrapStart: 'jarvis:bootstrap:start',
  bootstrapDone: 'jarvis:bootstrap:done',
  pipelinePhase: 'jarvis:pipeline:phase',
  pipelineSttPartial: 'jarvis:pipeline:stt-partial',
  pipelineSttFinal: 'jarvis:pipeline:stt-final',
  pipelineLlmToken: 'jarvis:pipeline:llm-token',
  pipelineLlmDone: 'jarvis:pipeline:llm-done',
  pipelineAmplitude: 'jarvis:pipeline:amplitude',
  pipelineRecorderState: 'jarvis:pipeline:recorder-state',
  pipelineError: 'jarvis:pipeline:error',
} as const;

export interface BootstrapProgressEvent {
  kind: ServiceKind;
  label: string;
  percentage: number;
  bytesDownloaded: number;
  totalBytes: number;
}

export interface BootstrapStartEvent {
  kind: ServiceKind;
  label: string;
}

export interface BootstrapDoneEvent {
  kind: ServiceKind;
}

export interface PipelinePhaseEvent {
  phase: 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';
}

export interface RecorderStateEventMain {
  state: AudioRecorderState;
}
