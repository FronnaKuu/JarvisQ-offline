# Desktop audio adapters

This folder is intentionally empty. The desktop audio strategy depends on which
shell the app is packaged into, so the choice is deferred until one is picked.

## Candidates

| Shell                  | Recorder option                          | Player option                           |
|------------------------|------------------------------------------|------------------------------------------|
| **Electron**           | `navigator.mediaDevices.getUserMedia`    | Web Audio API (`AudioContext`)          |
| **Tauri**              | `tauri-plugin-mic-recorder` or WebView + `getUserMedia` | Web Audio API in WebView     |
| **Pear (Holepunch)**   | `media-capture` bare module (WIP)        | `bare-audio` / `naudiodon`              |
| **Plain Node CLI**     | `naudiodon` (PortAudio binding)          | `naudiodon` playback                    |

All options can implement `IAudioRecorder` and `IAudioPlayer` from
`src/core/ports/` without changes to the core layer.

## When picking

1. Decide the shell (most likely **Electron** for cross-OS parity with the
   React Native UI, or **Tauri** for a smaller footprint).
2. Add the recorder/player class next to this README (e.g.
   `WebAudioRecorder.ts`, `NaudiodonAudioPlayer.ts`).
3. Export factories from `../Platform.ts` and wire them into `../bootstrap.ts`.
4. Validate VAD tuning (`AppConfig.vad`) against the chosen library — amplitude
   metering semantics differ between Web Audio (linear 0–1) and Expo-AV
   (dBFS -160 → 0).
