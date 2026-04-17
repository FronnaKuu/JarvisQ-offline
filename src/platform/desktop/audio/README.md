# Desktop audio adapters

Two-sided implementation of `IAudioRecorder` / `IAudioPlayer` for the Electron
desktop shell. Ports live in `@core/ports`; the concrete classes in this
folder bridge the Chromium renderer (Web Audio API) and the Node-based
Electron main process (VoicePipeline host) over IPC.

## Why Electron + Web Audio

The `@qvac/sdk` `node-rpc-client` natively targets Electron — it resolves its
Bare worker from `resourcesPath/app.asar.unpacked/qvac/worker.entry.mjs`. This
means the SDK needs no platform adapter on desktop; model loading + inference
"just work" in the main process. Audio, on the other hand, does not have a
zero-dependency Node cross-platform story, so we push microphone capture and
PCM playback into the renderer (Chromium exposes both through Web Audio).

## Layout

| File                    | Side      | Role                                             |
|-------------------------|-----------|--------------------------------------------------|
| `ipcChannels.ts`        | shared    | Channel names + typed payloads                   |
| `WebAudioRecorder.ts`   | renderer  | `getUserMedia` + `AudioWorkletNode`, VAD in dBFS |
| `WebAudioPlayer.ts`     | renderer  | `AudioContext` PCM playback                      |
| `IpcAudioRecorder.ts`   | main      | `IAudioRecorder` proxy → drives renderer         |
| `IpcAudioPlayer.ts`     | main      | `IAudioPlayer` proxy → streams PCM to renderer   |
| `wavEncoder.ts`         | main      | Float32 → 16-bit PCM WAV for STT ingestion       |

The renderer captures Float32 mono at its device sample rate, downsamples to
16 kHz (STT target), computes dBFS for VAD, and ships the samples back to
main on stop. Main writes a WAV under `getCacheDirectory()` and passes the
`file://` URI to `SttService.transcribeFile` — same contract the mobile
adapter satisfies.

TTS PCM flows in reverse: `VoicePipeline.drainTtsQueue` calls
`audioPlayer.addChunk` / `playAndClear`, which main forwards to the renderer;
the renderer builds an `AudioBuffer` and plays it.

## VAD thresholds

Both adapters consume `AppConfig.vad.*` (dBFS). `WebAudioRecorder` converts
RMS-over-window to dBFS before applying the thresholds so the constants tuned
on Android (`expo-av` returns dBFS directly) transfer unchanged. If the
installed microphone needs different sensitivity, tune `AppConfig` rather
than branching inside an adapter.

## When choosing a different shell

The ports are framework-free; swapping Electron for Tauri would mean
replacing only `IpcSender` / `IpcReceiver` implementations (passed through
`createDesktopPlatform`). The `Web*` classes themselves run unchanged in any
WebView that exposes `navigator.mediaDevices.getUserMedia` and Web Audio.
