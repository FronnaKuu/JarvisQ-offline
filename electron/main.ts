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

import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import type { IpcMainEvent, WebContents } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { close as closeSdk } from '@qvac/sdk';

import { bootstrapDesktop } from '@platform/desktop/bootstrap';
import { getCacheDirectory } from '@platform/desktop/paths';
import { createDesktopPlatform } from '@platform/desktop/Platform';
import type { IpcReceiver, IpcSender, IpcSubscription } from '@platform/desktop/audio/IpcAudioRecorder';

import { useSettingsStore } from '@domain/SettingsStore';
import { AppBootstrap } from '@core/bootstrap/AppBootstrap';
import type { ServiceProgressSnapshot } from '@core/bootstrap/AppBootstrap';
import { VoicePipeline } from '@core/pipeline/VoicePipeline';
import { LlmResponder } from '@core/pipeline/LlmResponder';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';
import { AppConfig } from '@core/config/AppConfig';
import type { ServiceKind } from '@core/bootstrap/AppBootstrap';

import { AppIpcChannels } from './ipcApi';

const STT_TARGET_SAMPLE_RATE = 16_000;

// ESM-safe __dirname for Electron main when transpiled to ESM.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.setName('JarvisQVAC');

let mainWindow: BrowserWindow | null = null;
let pipeline: VoicePipeline | null = null;
let isQuitting = false;

// Route stray top-level errors through the renderer instead of letting
// Electron's default "A JavaScript error occurred in the main process"
// dialog pop up. That dialog is modal and blocks the window so the user
// cannot close it — the exact symptom reported for failed model loads.
function reportMainProcessError(origin: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[main:${origin}]`, error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(AppIpcChannels.pipelineError, {
      message: `${origin}: ${message}`,
    });
  }
}

process.on('uncaughtException', (err) => reportMainProcessError('uncaughtException', err));
process.on('unhandledRejection', (err) => reportMainProcessError('unhandledRejection', err));

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
  // Desktop keeps a single LLM pipeline (translation mode is mobile-only for
  // now); the responder abstraction is still used so the core pipeline API
  // matches mobile.
  const responder = new LlmResponder(LlmService, {
    systemPrompt: AppConfig.conversation.defaultSystemPrompt,
  });

  return new VoicePipeline(
    {
      services: { stt: SttService, responder, tts: TtsService },
      recorder,
      audioPlayer: player,
    },
    {
      onPhaseChange: (phase) => send(AppIpcChannels.pipelinePhase, { phase }),
      onAmplitude: (dbFS) => send(AppIpcChannels.pipelineAmplitude, { dbFS }),
      onTranscriptionPartial: (text: string) =>
        send(AppIpcChannels.pipelineSttPartial, { text }),
      onDictationCommitted: (text: string) =>
        send(AppIpcChannels.pipelineSttPartial, { text }),
      onDictationRunningPartial: (text: string) =>
        send(AppIpcChannels.pipelineSttPartial, { text }),
      onSttFinal: (text) => send(AppIpcChannels.pipelineSttFinal, { text }),
      onLlmToken: (token) => send(AppIpcChannels.pipelineLlmToken, { token }),
      onLlmDone: (fullText) => send(AppIpcChannels.pipelineLlmDone, { fullText }),
      onError: (message) => send(AppIpcChannels.pipelineError, { message }),
    },
    {
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
    const handlers = {
      onServiceStart: (kind: ServiceKind, label: string) =>
        sender.send(AppIpcChannels.bootstrapStart, { kind, label }),
      onServiceProgress: (kind: ServiceKind, p: ServiceProgressSnapshot) =>
        sender.send(AppIpcChannels.bootstrapProgress, {
          kind,
          label: bootstrap.profileLabels(modelIds)[kind],
          percentage: p.percentage,
          bytesDownloaded: p.bytesDownloaded,
          totalBytes: p.totalBytes,
        }),
      onServiceDone: (kind: ServiceKind) =>
        sender.send(AppIpcChannels.bootstrapDone, { kind }),
    };
    await bootstrap.ensureAlwaysOn(settings, modelIds, handlers);
    // Desktop preloads the LLM eagerly — there's no mode picker yet on this
    // target, so the conversation responder must be ready by the time the
    // renderer attaches.
    await bootstrap.ensureResponderReady(
      'conversation',
      settings,
      modelIds,
      {},
      handlers,
    );
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

// Electron loads the renderer from file://, which triggers Chromium's
// permission prompt for `media` (microphone). There is no UI to click
// "Allow" on a `file://` origin, so the prompt is effectively a silent
// deny — the recorder starts, getUserMedia rejects, the pipeline aborts,
// and the button flashes LISTENING for a few ms before returning to IDLE.
// Grant the microphone explicitly for our own renderer.
function grantMicrophoneForOwnRenderer(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media';
  });
}

async function onReady(): Promise<void> {
  grantMicrophoneForOwnRenderer();
  await bootstrapDesktop();
  mainWindow = await createMainWindow();
  pipeline = await buildPipeline(mainWindow);
  registerIpcHandlers(mainWindow);
}

app.whenReady().then(onReady).catch((error: unknown) => {
  // Bootstrap failures before the window exists are fatal — show the system
  // dialog and abort rather than silently starving the renderer.
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox('JarvisQVAC failed to start', message);
  app.quit();
});

// The SDK spawns a Bare worker subprocess that owns the rocksdb/hypercore
// file locks on the user's model cache. Leaking that subprocess is what
// causes "File descriptor could not be locked" on the next launch. Tear it
// down before the process exits.
app.on('before-quit', async (event) => {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();
  try {
    if (pipeline) {
      await pipeline.interrupt();
      await pipeline.stopListening();
    }
    await closeSdk();
  } catch (err) {
    console.error('[main] shutdown error', err);
  } finally {
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void onReady();
  }
});
