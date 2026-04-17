// ─── Desktop Renderer Entry ──────────────────────────────────────────────────
// Minimal UI consuming the `window.jarvis` bridge. Responsibilities:
//
//   1. Install the audio bridge (Web Audio ↔ IPC).
//   2. Render bootstrap progress for STT / LLM / TTS.
//   3. Relay user input (text and voice) to the main process.
//   4. Reflect pipeline phase, amplitude, and streamed tokens.
//
// No framework — keeps the renderer bundle lightweight and avoids pulling in
// the RN/Expo layer. A richer React-based UI can replace this file later
// without touching main / preload / adapters.

import { installAudioBridge } from './audioBridge';

interface PhaseEvent { phase: 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' }
interface AmplitudeEvent { dbFS: number }
interface SttPartialEvent { text: string }
interface SttFinalEvent { text: string }
interface LlmTokenEvent { token: string }
interface LlmDoneEvent { fullText: string }
interface BootstrapStartEvent { kind: 'stt' | 'llm' | 'tts'; label: string }
interface BootstrapProgressEvent { kind: 'stt' | 'llm' | 'tts'; label: string; percentage: number }
interface BootstrapDoneEvent { kind: 'stt' | 'llm' | 'tts' }
interface PipelineErrorEvent { message: string }

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: #${id}`);
  return node as T;
};

const phaseEl = el<HTMLSpanElement>('phase');
const meterBar = el<HTMLDivElement>('meter-bar');
const transcriptEl = el<HTMLDivElement>('transcript');
const bootstrapList = el<HTMLUListElement>('bootstrap-list');
const btnBootstrap = el<HTMLButtonElement>('btn-bootstrap');
const btnVoice = el<HTMLButtonElement>('btn-voice');
const btnStop = el<HTMLButtonElement>('btn-stop');
const btnSend = el<HTMLButtonElement>('btn-send');
const inputText = el<HTMLInputElement>('input-text');
const composerForm = el<HTMLFormElement>('composer');

installAudioBridge();

// ── Readiness gate ───────────────────────────────────────────────────────
// The voice button and text send both go through the pipeline, which needs
// STT + LLM loaded. Disable them until bootstrap completes so the user sees
// a clear state instead of "STT model not loaded" after every attempt.
const REQUIRED_READY_KINDS = new Set<'stt' | 'llm' | 'tts'>(['stt', 'llm', 'tts']);
const readyKinds = new Set<'stt' | 'llm' | 'tts'>();

function setPipelineButtonsEnabled(enabled: boolean): void {
  btnVoice.disabled = !enabled;
  btnSend.disabled = !enabled;
  inputText.disabled = !enabled;
}

setPipelineButtonsEnabled(false);

// ── Bootstrap UI ──────────────────────────────────────────────────────────
const bootstrapRows = new Map<string, HTMLLIElement>();

function upsertBootstrapRow(kind: string, label: string, status: string): void {
  let row = bootstrapRows.get(kind);
  if (!row) {
    row = document.createElement('li');
    row.dataset.kind = kind;
    row.innerHTML = `<span class="name"></span><span class="value"></span>`;
    bootstrapList.appendChild(row);
    bootstrapRows.set(kind, row);
  }
  (row.querySelector('.name') as HTMLElement).textContent = `${kind.toUpperCase()} · ${label}`;
  (row.querySelector('.value') as HTMLElement).textContent = status;
}

window.jarvis.onBootstrapStart((raw) => {
  const e = raw as BootstrapStartEvent;
  upsertBootstrapRow(e.kind, e.label, 'loading…');
});

window.jarvis.onBootstrapProgress((raw) => {
  const e = raw as BootstrapProgressEvent;
  const pct = Math.max(0, Math.min(100, Math.round(e.percentage)));
  upsertBootstrapRow(e.kind, e.label, `${pct}%`);
});

window.jarvis.onBootstrapDone((raw) => {
  const e = raw as BootstrapDoneEvent;
  const row = bootstrapRows.get(e.kind);
  if (row) {
    row.dataset.state = 'done';
    (row.querySelector('.value') as HTMLElement).textContent = 'ready';
  }
  readyKinds.add(e.kind);
  if (REQUIRED_READY_KINDS.size === readyKinds.size) {
    setPipelineButtonsEnabled(true);
  }
});

btnBootstrap.addEventListener('click', async () => {
  btnBootstrap.disabled = true;
  try {
    await window.jarvis.bootstrap();
  } catch (err) {
    appendBubble('assistant', `Bootstrap failed: ${(err as Error).message}`);
  } finally {
    btnBootstrap.disabled = false;
  }
});

// ── Transcript ─────────────────────────────────────────────────────────────
let pendingUserBubble: HTMLDivElement | null = null;
let streamingAssistantBubble: HTMLDivElement | null = null;

function appendBubble(role: 'user' | 'assistant', text: string): HTMLDivElement {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  transcriptEl.appendChild(bubble);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  return bubble;
}

window.jarvis.onSttPartial((raw) => {
  const e = raw as SttPartialEvent;
  if (!pendingUserBubble) pendingUserBubble = appendBubble('user', '');
  pendingUserBubble.textContent = e.text;
});

window.jarvis.onSttFinal((raw) => {
  const e = raw as SttFinalEvent;
  if (!pendingUserBubble) pendingUserBubble = appendBubble('user', '');
  pendingUserBubble.textContent = e.text;
  pendingUserBubble = null;
});

window.jarvis.onLlmToken((raw) => {
  const e = raw as LlmTokenEvent;
  if (!streamingAssistantBubble) streamingAssistantBubble = appendBubble('assistant', '');
  streamingAssistantBubble.textContent = (streamingAssistantBubble.textContent ?? '') + e.token;
});

window.jarvis.onLlmDone((raw) => {
  const e = raw as LlmDoneEvent;
  if (!streamingAssistantBubble) streamingAssistantBubble = appendBubble('assistant', '');
  streamingAssistantBubble.textContent = e.fullText;
  streamingAssistantBubble = null;
});

window.jarvis.onPhase((raw) => {
  const e = raw as PhaseEvent;
  phaseEl.dataset.phase = e.phase;
  phaseEl.textContent = e.phase;
  btnVoice.classList.toggle('active', e.phase === 'LISTENING');
});

window.jarvis.onAmplitude((raw) => {
  const e = raw as AmplitudeEvent;
  // Map -60 dBFS → 0%, 0 dBFS → 100%.
  const pct = Math.max(0, Math.min(100, ((e.dbFS + 60) / 60) * 100));
  meterBar.style.width = `${pct}%`;
});

window.jarvis.onPipelineError((raw) => {
  const e = raw as PipelineErrorEvent;
  appendBubble('assistant', `⚠ ${e.message}`);
});

// ── Input handling ─────────────────────────────────────────────────────────
composerForm.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  const value = inputText.value.trim();
  if (!value) return;
  inputText.value = '';
  btnSend.disabled = true;
  try {
    await window.jarvis.sendText(value);
  } finally {
    btnSend.disabled = false;
  }
});

// Tap-to-toggle voice turn. A first tap starts listening; VAD auto-stops
// when the user falls silent, but a second tap short-circuits that so the
// user isn't stuck waiting for the silence timeout. The `active` class is
// *not* toggled here — the pipeline phase (`onPhase` above) is the source
// of truth so the button always reflects what the backend is actually
// doing, even if startVoice() rejects mid-flight.
let voiceActivePhase: PhaseEvent['phase'] = 'IDLE';

window.jarvis.onPhase((raw) => {
  voiceActivePhase = (raw as PhaseEvent).phase;
});

btnVoice.addEventListener('click', async () => {
  if (voiceActivePhase === 'LISTENING') {
    await window.jarvis.stopPipeline();
    return;
  }
  try {
    await window.jarvis.startVoice();
  } catch (err) {
    appendBubble('assistant', `Voice start failed: ${(err as Error).message}`);
  }
});

btnStop.addEventListener('click', () => window.jarvis.stopPipeline());
