// ─── Electron Main Process ───────────────────────────────────────────────────
// Desktop entry point. Responsibilities:
//
//   1. Register desktop adapters into the core `PlatformContainer`
//      (`bootstrapDesktop()` handles this — reuses the same contract as the
//      mobile bootstrap).
//   2. Spawn a `BrowserWindow` that loads the renderer bundle and exposes an
//      IPC surface through the preload script.
//   3. Build the `VoicePipeline` with IPC-backed audio adapters — the renderer
//      owns `getUserMedia` / Web Audio; this process owns everything else.
//   4. Answer renderer requests (bootstrap models, send text, start voice,
//      stop) and push pipeline events back as they happen.
//
// All configuration comes from `AppConfig` / `ModelConfig` / `SettingsStore`.
// No paths, URLs, or thresholds are hardcoded here.

import { app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainEvent, WebContents } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrapDesktop } from '@platform/desktop/bootstrap';
import { getCacheDirectory } from '@platform/desktop/paths';
import { createDesktopPlatform } from '@platform/desktop/Platform';
import type { IpcReceiver, IpcSender, IpcSubscription } from '@platform/desktop/audio/IpcAudioRecorder';

import { useSettingsStore } from '@domain/SettingsStore';
import { AppBootstrap } from '@core/bootstrap/AppBootstrap';
import type { ServiceProgressSnapshot } from '@core/bootstrap/AppBootstrap';
import { VoicePipeline } from '@core/pipeline/VoicePipeline';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';
import { AppConfig } from '@core/config/AppConfig';

import { AppIpcChannels } from './ipcApi';

const STT_TARGET_SAMPLE_RATE = 16_000;

// ESM-safe __dirname for Electron main when transpiled to ESM.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.setName('JarvisQVAC');

let mainWindow: BrowserWindow | null = null;
let pipeline: VoicePipeline | null = null;

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 960,
    height: 720,
    backgroundColor: '#0b0d12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  await window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return window;
}

/** Adapts Electron's IPC primitives to the framework-free `IpcSender` port. */
function buildIpcSender(webContents: WebContents): IpcSender {
  return {
    send(channel, payload) {
      if (webContents.isDestroyed()) return;
      webContents.send(channel, payload);
    },
  };
}

/** Adapts `ipcMain.on` to the framework-free `IpcReceiver` port. */
function buildIpcReceiver(): IpcReceiver {
  return {
    on(channel, handler) {
      const listener = (_event: IpcMainEvent, payload: unknown) => handler(payload);
      ipcMain.on(channel, listener);
      const sub: IpcSubscription = {
        off() {
          ipcMain.removeListener(channel, listener);
        },
      };
      return sub;
    },
  };
}

async function buildPipeline(window: BrowserWindow): Promise<VoicePipeline> {
  const sender = buildIpcSender(window.webContents);
  const receiver = buildIpcReceiver();
  const platform = createDesktopPlatform({
    sender,
    receiver,
    cacheDirectory: getCacheDirectory(),
    targetSampleRate: STT_TARGET_SAMPLE_RATE,
  });

  const send = (channel: string, payload?: unknown) => sender.send(channel, payload ?? {});
  const recorder = platform.createAudioRecorder({
    onStateChange: (state) => send(AppIpcChannels.pipelineRecorderState, { state }),
    onAmplitude: (dbFS) => send(AppIpcChannels.pipelineAmplitude, { dbFS }),
  });
  const player = platform.createAudioPlayer();

  // `SttService`/`LlmService`/`TtsService` are singletons that keep a loaded
  // model across calls. The first run triggers download + warm-up via
  // AppBootstrap; subsequent pipeline turns are hot.
  return new VoicePipeline(
    {
      services: { stt: SttService, llm: LlmService, tts: TtsService },
      recorder,
      audioPlayer: player,
    },
    {
      onPhaseChange: (phase) => send(AppIpcChannels.pipelinePhase, { phase }),
      onAmplitude: (dbFS) => send(AppIpcChannels.pipelineAmplitude, { dbFS }),
      onSttPartial: (text) => send(AppIpcChannels.pipelineSttPartial, { text }),
      onSttFinal: (text) => send(AppIpcChannels.pipelineSttFinal, { text }),
      onLlmToken: (token) => send(AppIpcChannels.pipelineLlmToken, { token }),
      onLlmDone: (fullText) => send(AppIpcChannels.pipelineLlmDone, { fullText }),
      onError: (message) => send(AppIpcChannels.pipelineError, { message }),
    },
    {
      systemPrompt: AppConfig.conversation.defaultSystemPrompt,
      temperature: AppConfig.llm.defaultTemperature,
      maxTokens: AppConfig.llm.defaultMaxTokens,
      ttsBufferMode: AppConfig.tts.defaultBufferMode,
    },
  );
}

function registerIpcHandlers(window: BrowserWindow): void {
  const sender = buildIpcSender(window.webContents);

  ipcMain.handle(AppIpcChannels.bootstrap, async () => {
    const store = useSettingsStore.getState();
    if (!store.isLoaded) await store.loadSettings();
    const { settings, modelIds } = useSettingsStore.getState();
    const bootstrap = new AppBootstrap();
    await bootstrap.ensureReady(settings, modelIds, {
      onServiceStart: (kind, label) =>
        sender.send(AppIpcChannels.bootstrapStart, { kind, label }),
      onServiceProgress: (kind, p: ServiceProgressSnapshot) =>
        sender.send(AppIpcChannels.bootstrapProgress, {
          kind,
          label: bootstrap.profileLabels(modelIds)[kind],
          percentage: p.percentage,
          bytesDownloaded: p.bytesDownloaded,
          totalBytes: p.totalBytes,
        }),
      onServiceDone: (kind) => sender.send(AppIpcChannels.bootstrapDone, { kind }),
    });
  });

  ipcMain.handle(AppIpcChannels.sendText, async (_evt: unknown, raw: unknown) => {
    const { text } = (raw ?? {}) as { text?: string };
    if (!text || !pipeline) return;
    await pipeline.sendText(text);
  });

  ipcMain.handle(AppIpcChannels.startVoice, async () => {
    if (!pipeline) return;
    await pipeline.startListening();
  });

  ipcMain.handle(AppIpcChannels.stopPipeline, async () => {
    if (!pipeline) return;
    await pipeline.interrupt();
    await pipeline.stopListening();
  });
}

async function onReady(): Promise<void> {
  await bootstrapDesktop();
  mainWindow = await createMainWindow();
  pipeline = await buildPipeline(mainWindow);
  registerIpcHandlers(mainWindow);
}

app.whenReady().then(onReady).catch((error: unknown) => {
  console.error('Desktop bootstrap failed:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void onReady();
  }
});
