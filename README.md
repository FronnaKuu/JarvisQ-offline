# JarvisQVAC

On-device, private voice assistant built as an extension of the
[Tether QVAC SDK](https://github.com/tetherto/qvac-sdk). Runs the full STT →
LLM → TTS pipeline locally: no data leaves the device.

Currently ships as an Expo + React Native application targeting Android. The
codebase is structured as a **hexagonal / ports-and-adapters** architecture so
the same core can be wired to additional runtimes (iOS, Windows, macOS, Linux)
by adding a new platform adapter — see [Architecture](#architecture).

---

## Features

- **Speech-to-text** — Whisper (tiny / base / small / large-v3-turbo) or
  Parakeet TDT v3 (25 languages, INT8 or FP32).
- **Large language model** — Qwen3 1.7B / 4B (GGUF, llama.cpp).
- **Text-to-speech** — pluggable engine:
  - `supertonic` — on-device Supertonic ONNX (44.1 kHz, multi-voice, English
    only).
  - `system` — device-native engine through `expo-speech` (Google TTS on
    Android, AVSpeechSynthesizer on iOS). Language, voice and default engine
    follow the OS-level TTS settings; the Settings screen exposes an "Open
    system TTS settings" shortcut that launches the `TTS_SETTINGS` intent.
  - Per-turn speed and pitch are configurable; the engine accepts runtime
    `TtsRuntimeOptions` through `ITtsService.speak()`.
- **TTS timing modes** — `streaming` (low time-to-first-audio, speaks each
  clause while the LLM is still decoding) or `buffered` (speaks only after
  the full response is ready — avoids token-stream contention with on-device
  synthesis on weaker devices).
- **P2P model distribution** via Hyperswarm registry with **HTTPS fallback**
  to HuggingFace. TTS fallback handles split `.onnx` + `.onnx_data` files
  correctly by pre-downloading with original filenames.
- **Voice activity detection** based on `expo-av` metering with configurable
  speech/silence thresholds.
- **Conversation persistence** with SQLite (history, per-conversation model
  settings, streaming-aware message updates).

---

## Quick start

### Prerequisites

- Node.js ≥ 20
- Expo SDK 54 tooling (`npm i -g expo`)
- Android Studio + SDK for Android builds
- An Android device or emulator with ≥ 6 GB RAM (LLM + STT + TTS running
  concurrently pin ~3.5 GB at steady state)

### Install

```bash
npm install
npx expo prebuild
```

### Run a debug build (hot reload)

```bash
npm run android
```

### Build and install a standalone release APK

```bash
cd android && ./gradlew assembleRelease
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

The release APK embeds the JS bundle (`assets/index.android.bundle`, Hermes
bytecode), so the app runs without a Metro connection — keeps working after
USB disconnect.

If you changed `app.json`, installed a new Expo plugin, or edited native
config, run `npx expo prebuild --platform android` first. See
[AGENTS.md](AGENTS.md) ("Android release build & verify") for the full
workflow, including how to verify the APK actually contains your JS changes
and how to diagnose a stuck splash screen.

---

## Architecture

```
src/
├── app/           Expo Router screens (delivery layer)
│   ├── _layout.tsx        Root stack + providers (Paper, SafeArea)
│   ├── index.tsx          Splash: bootstrap + permission + offline probe
│   ├── conversation.tsx   Main chat (voice + text fallback)
│   ├── conversations.tsx  List/rename/delete stored conversations
│   ├── settings.tsx       Full AppSettings editor (debounced)
│   └── setup.tsx          Legacy explicit-setup entry (reserved)
├── core/          Platform-agnostic business logic
│   ├── bootstrap/   AppBootstrap — orchestrates STT/LLM/TTS readiness
│   ├── config/      AppConfig, ModelConfig, HttpModelSources
│   ├── inference/   SttService, LlmService, TtsService (SDK wrappers)
│   ├── net/         FetchNetworkInfo — shared fetch-based INetworkInfo
│   ├── pipeline/    VoicePipeline (voice loop, barge-in, text fallback)
│   ├── ports/       IAudioRecorder, IAudioPlayer, IFileSystem,
│   │                IKeyValueStore, IDatabase, IHaptics, IPermissions,
│   │                INetworkInfo — cross-platform contracts
│   ├── platform/    PlatformContainer (service locator for adapters)
│   └── utils/       Pure helpers (loadWithFallback, formatTime, ...)
├── data/          Repositories + row mappers (depend on IDatabase only)
├── domain/        Zustand stores (Settings, Conversation, Bootstrap) + types
├── platform/
│   ├── mobile/      Expo adapters (ExpoAudioRecorder, ExpoFileSystem,
│   │                ExpoSqliteDatabase, AsyncStorageKeyValueStore,
│   │                ExpoPermissions, RnVibrationHaptics,
│   │                bootstrap.ts — registers adapters into the container)
│   │                SystemTtsService — expo-speech adapter selected at
│   │                runtime when AppSettings.ttsEngine === 'system')
│   └── desktop/     Node adapters (NodeFileSystem, JsonFileKeyValueStore,
│                    NodeSqliteDatabase, NoopHaptics,
│                    AlwaysGrantedPermissions) — scaffold ready; audio
│                    backend (Electron / Tauri / Pear) still to be chosen
└── ui/
    ├── components/  ChatBubble, VoiceButton, TextComposer,
    │                DownloadProgress, settings/NumericSettingRow
    └── theme/       AppTheme + spacing / radius / typography / status tokens
```

### Design rules

1. **`src/core/` is platform-free.** No import of `expo-*`, `react-native-*`,
   `@react-native-*`, or Node-only modules is allowed in the core. Platform
   capabilities are consumed through the ports under `src/core/ports/`.
2. **`@qvac/sdk` is used directly**, not wrapped. Upgrading the SDK is a
   one-line `package.json` bump; no shim layer to maintain.
3. **Adapters live under `src/platform/<target>/`.** Adding a new target means
   implementing the five ports and writing a matching `bootstrap.ts` that
   calls `registerPlatform()` from `@core/platform/PlatformContainer`.
4. **Repositories depend on `IDatabase`** — not on `expo-sqlite`. Swapping to
   `better-sqlite3` on desktop requires one new adapter.
5. **No hardcoded filesystem paths.** All paths derive from
   `IFileSystem.documentDirectory` + `AppConfig.models.directoryName`.

### Extending to a new platform

1. Implement the required ports in `src/platform/<target>/`:
   - `IFileSystem`, `IKeyValueStore`, `IDatabase`, `IAudioRecorder`,
     `IAudioPlayer`, `IHaptics`, `IPermissions`, `INetworkInfo`.
2. Write `src/platform/<target>/bootstrap.ts` that instantiates each adapter
   and calls `registerPlatform()`.
3. Wire the bootstrap into the target's entry point.
4. Provide a `Platform.ts` factory that returns the audio adapters to
   `VoicePipeline` (mirrors `src/platform/mobile/Platform.ts`).

`FetchNetworkInfo` (in `src/core/net/`) is a default implementation of
`INetworkInfo` that works anywhere `fetch` + `AbortController` are available;
both mobile and desktop reuse it. The core, repositories, UI components, and
Zustand stores do not need to change.

### Desktop status (Windows / macOS / Linux)

The desktop target is an **Electron shell** under `electron/` that hosts
`VoicePipeline` in the main process and delegates microphone + PCM playback
to the renderer over IPC. All eight ports are implemented with zero native
dependencies:

- `NodeFileSystem` — `node:fs/promises` + `node:https` with range + redirects.
- `JsonFileKeyValueStore` — atomic JSON persistence under the OS app-data
  directory (`%APPDATA%`, `~/Library/Application Support`, `$XDG_DATA_HOME`).
- `NodeSqliteDatabase` — `node:sqlite`.
- `IpcAudioRecorder` / `IpcAudioPlayer` — main-side proxies.
- `WebAudioRecorder` / `WebAudioPlayer` — renderer implementation with
  `getUserMedia`, `AudioWorkletNode`, and dBFS VAD that reuses
  `AppConfig.vad.*` unchanged.
- `NoopHaptics`, `AlwaysGrantedPermissions`, `FetchNetworkInfo` — stubs.

The `@qvac/sdk` `node-rpc-client` auto-locates the pre-bundled Bare worker at
`resources/app.asar.unpacked/qvac/worker.entry.mjs` when packaged, so the
same STT / LLM / TTS services the mobile app consumes run unchanged on Windows.

**Windows build:**

```bash
npm run desktop:build            # esbuild → build/desktop/
npm run desktop:dev              # launch Electron
npm run desktop:dist:win         # NSIS installer in release/desktop/win/
```

See [AGENTS.md](AGENTS.md) ("Desktop (Windows) build & verify") and
`src/platform/desktop/audio/README.md` for details.

---

## Model configuration

Model selection is profile-driven via `src/core/config/ModelConfig.ts`. Each
profile exposes `buildLoadConfig()` (registry / P2P source) and optionally
`buildHttpFallbackConfig()` (HuggingFace HTTPS URLs pinned to a commit SHA).

Supported profiles:

| Kind | Default | Alternatives |
|------|---------|--------------|
| STT  | `parakeet_tdt_int8` | `whisper_{tiny,base,small,large_v3_turbo}`, `parakeet_tdt_fp32` |
| LLM  | `qwen3_1_7b`        | `qwen3_4b` |
| TTS  | `supertonic_en`     | `system` (device-native, selected via `AppSettings.ttsEngine`) |

---

## Compatibility

JarvisQVAC tracks **`@qvac/sdk` 0.8.x**. The SDK is loaded as a regular
dependency with no local fork or patch — see `package.json`. This project
is a *consumer* of QVAC, not a fork of it.

---

## Contributing

Run the checks before opening a PR:

```bash
npm run typecheck
```

Code style: English identifiers and comments, two-space indent, no default
exports except for React components. Keep platform leaks out of `src/core/`;
extend the ports instead.

## License

TBD.
