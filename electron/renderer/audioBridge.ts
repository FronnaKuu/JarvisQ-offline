// ─── Renderer Audio Bridge ───────────────────────────────────────────────────
// Glues the preload-exposed IPC surface (`window.jarvis.audio`) to the real
// Web Audio adapters (`WebAudioRecorder` / `WebAudioPlayer`). The main-process
// `Ipc*` proxies drive lifecycle; this module is the counterpart that owns
// the DOM-side audio graph.

import { WebAudioRecorder } from '../../src/platform/desktop/audio/WebAudioRecorder';
import { WebAudioPlayer } from '../../src/platform/desktop/audio/WebAudioPlayer';
import type {
  PlayerChunkPayload,
  PlayerPlayRequest,
  RecorderStartRequest,
} from '../../src/platform/desktop/audio/ipcChannels';
import type { JarvisBridge } from '../preload';

declare global {
  interface Window {
    jarvis: JarvisBridge;
  }
}

function bubbleRecorderError(message: string): void {
  const transcript = document.getElementById('transcript');
  if (!transcript) return;
  const bubble = document.createElement('div');
  bubble.className = 'bubble assistant';
  bubble.textContent = `\u26A0 Microphone error: ${message}`;
  transcript.appendChild(bubble);
  transcript.scrollTop = transcript.scrollHeight;
}

export function installAudioBridge(): void {
  const api = window.jarvis.audio;

  let activeRecorder: WebAudioRecorder | null = null;
  let activeRequestId: string | null = null;

  api.onRecorderStart((raw) => {
    const req = raw as RecorderStartRequest;
    activeRequestId = req.requestId;

    activeRecorder = new WebAudioRecorder({
      onStateChange: (state) =>
        api.sendRecorderState({ requestId: req.requestId, state }),
      onAmplitude: (dbFS) =>
        api.sendRecorderAmplitude({ requestId: req.requestId, dbFS }),
    });

    activeRecorder
      .captureToResult()
      .then((capture) => {
        api.sendRecorderResult({
          requestId: req.requestId,
          samples: capture?.samples ?? null,
          sampleRate: capture?.sampleRate ?? req.targetSampleRate,
          durationMs: capture?.durationMs ?? 0,
          speechDetected: capture?.speechDetected ?? false,
          meteringAvailable: capture?.meteringAvailable ?? false,
        });
      })
      .catch((error) => {
        // Surface recorder failures to the transcript. Without this, a
        // denied microphone permission or a missing capture device only
        // logs to devtools, which a packaged user cannot reach — they
        // just see the button flash on and go back to IDLE.
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[audio] recorder failed', error);
        bubbleRecorderError(msg);
        api.sendRecorderResult({
          requestId: req.requestId,
          samples: null,
          sampleRate: req.targetSampleRate,
          durationMs: 0,
          speechDetected: false,
          meteringAvailable: false,
        });
      })
      .finally(() => {
        if (activeRequestId === req.requestId) {
          activeRecorder = null;
          activeRequestId = null;
        }
      });
  });

  api.onRecorderAbort(() => {
    const recorder = activeRecorder;
    activeRecorder = null;
    activeRequestId = null;
    if (recorder) void recorder.abort();
  });

  const player = new WebAudioPlayer();

  api.onPlayerAddChunk((raw) => {
    const chunk = raw as PlayerChunkPayload;
    player.addChunk(chunk.samples, chunk.sampleRate);
  });

  api.onPlayerPlayAndClear(async (raw) => {
    const req = raw as PlayerPlayRequest;
    try {
      await player.playAndClear();
    } finally {
      api.sendPlayerDone({ utteranceId: req.utteranceId });
    }
  });

  api.onPlayerStop(() => {
    void player.stop();
  });

  api.onPlayerReset(() => {
    player.reset();
  });
}
