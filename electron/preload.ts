// ─── Electron Preload ────────────────────────────────────────────────────────
// Runs with Node integration enabled and bridges a *narrow* IPC surface into
// the renderer via contextBridge. The renderer stays sandboxed; only the
// channels required by `AppIpcChannels` + audio bridge are exposed.
//
// Keep this file dependency-light: no core imports beyond shared type-only
// channel constants, so the compiled preload bundle stays tiny.

import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { AudioIpcChannels } from '../src/platform/desktop/audio/ipcChannels';
import { AppIpcChannels } from './ipcApi';

type Unsubscribe = () => void;

function subscribe<T>(
  channel: string,
  handler: (payload: T) => void,
): Unsubscribe {
  const listener = (_evt: IpcRendererEvent, payload: T) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const jarvis = {
  // ── App commands (renderer → main) ──────────────────────────────────────
  bootstrap: () => ipcRenderer.invoke(AppIpcChannels.bootstrap),
  sendText: (text: string) => ipcRenderer.invoke(AppIpcChannels.sendText, { text }),
  startVoice: () => ipcRenderer.invoke(AppIpcChannels.startVoice),
  stopPipeline: () => ipcRenderer.invoke(AppIpcChannels.stopPipeline),

  // ── App events (main → renderer) ────────────────────────────────────────
  onBootstrapStart: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.bootstrapStart, cb),
  onBootstrapProgress: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.bootstrapProgress, cb),
  onBootstrapDone: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.bootstrapDone, cb),
  onPhase: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.pipelinePhase, cb),
  onSttPartial: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.pipelineSttPartial, cb),
  onSttFinal: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.pipelineSttFinal, cb),
  onLlmToken: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.pipelineLlmToken, cb),
  onLlmDone: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.pipelineLlmDone, cb),
  onAmplitude: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.pipelineAmplitude, cb),
  onPipelineError: (cb: (e: unknown) => void) =>
    subscribe(AppIpcChannels.pipelineError, cb),

  // ── Audio bridge (renderer ↔ main) ──────────────────────────────────────
  audio: {
    onRecorderStart: (cb: (e: unknown) => void) =>
      subscribe(AudioIpcChannels.recorderStart, cb),
    onRecorderAbort: (cb: (e: unknown) => void) =>
      subscribe(AudioIpcChannels.recorderAbort, cb),
    sendRecorderState: (payload: unknown) =>
      ipcRenderer.send(AudioIpcChannels.recorderState, payload),
    sendRecorderAmplitude: (payload: unknown) =>
      ipcRenderer.send(AudioIpcChannels.recorderAmplitude, payload),
    sendRecorderResult: (payload: unknown) =>
      ipcRenderer.send(AudioIpcChannels.recorderResult, payload),

    onPlayerAddChunk: (cb: (e: unknown) => void) =>
      subscribe(AudioIpcChannels.playerAddChunk, cb),
    onPlayerPlayAndClear: (cb: (e: unknown) => void) =>
      subscribe(AudioIpcChannels.playerPlayAndClear, cb),
    onPlayerStop: (cb: (e: unknown) => void) =>
      subscribe(AudioIpcChannels.playerStop, cb),
    onPlayerReset: (cb: (e: unknown) => void) =>
      subscribe(AudioIpcChannels.playerReset, cb),
    sendPlayerDone: (payload: unknown) =>
      ipcRenderer.send(AudioIpcChannels.playerPlaybackDone, payload),
  },
} as const;

export type JarvisBridge = typeof jarvis;

contextBridge.exposeInMainWorld('jarvis', jarvis);
