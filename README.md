# JarvisQ

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Helldez/JarvisQ/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Helldez/JarvisQ/actions/workflows/ci.yml)
[![Release](https://github.com/Helldez/JarvisQ/actions/workflows/release.yml/badge.svg)](https://github.com/Helldez/JarvisQ/actions/workflows/release.yml)
<a href="https://github.com/tetherto/qvac"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tetherto/qvac/main/docs/branding/qvac-badge-inline-green-dark.svg"><img alt="Built with QVAC" src="https://raw.githubusercontent.com/tetherto/qvac/main/docs/branding/qvac-badge-inline-green-light.svg"></picture></a>

Private, on-device voice assistant — STT → LLM → TTS pipeline running fully
locally on the user's hardware. **No data leaves the device.**

Built on top of the [Tether QVAC SDK](https://github.com/tetherto/qvac)
(`@qvac/sdk`). Currently ships as an Expo + React Native application targeting
Android, with a Windows / macOS / Linux desktop target via Electron. The
codebase follows a **hexagonal / ports-and-adapters** architecture so the same
core can be wired to additional runtimes by adding a new platform adapter —
see [Architecture](#architecture).

> JarvisQ is an independent project and is not affiliated with or endorsed by
> Tether. "QVAC" is a trademark of Tether; this project references it only to
> describe the origin of the underlying SDK.

---

## Privacy & threat model

- **Fully on-device**. Speech recognition, language modelling, and speech
  synthesis run inside the app process. Microphone audio, transcripts, and
  generated text are never sent to any remote service.
- **No telemetry**. The app makes no analytics or crash-reporting calls.
- **Conversations stored locally**, in a SQLite database under the app's
  private storage. They are never uploaded.
- **Network usage is limited to model distribution**. The first time a model
  is needed, JarvisQ downloads its weights either through the QVAC P2P
  registry (Hyperswarm) or — when no peers are reachable — over HTTPS from
  Hugging Face. Every HTTPS URL is pinned to a specific commit SHA in
  `src/core/config/HttpModelSources.ts` for reproducibility.
- **Connectivity probe only**. Before starting a download the app issues a
  single HEAD request to `https://www.google.com/generate_204` to detect
  offline state. No data is exchanged.
- **Permissions** (Android): `RECORD_AUDIO`, `INTERNET`, `ACCESS_NETWORK_STATE`.
  No location, contacts, storage, or background services.

If you find a vulnerability, please follow the disclosure process in
[SECURITY.md](SECURITY.md).

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
    follow the OS-level TTS settings; the Settings screen exposes an
    "Open system TTS settings" shortcut that launches the `TTS_SETTINGS` intent.
  - Per-turn speed and pitch are configurable; the engine accepts runtime
    `TtsRuntimeOptions` through `ITtsService.speak()`.
- **TTS timing modes** — `streaming` (low time-to-first-audio, speaks each
  clause while the LLM is still decoding) or `buffered` (speaks only after
  the full response is ready — avoids token-stream contention with on-device
  synthesis on weaker devices).
- **Translation mode** — Bergamot NMT pairs with English pivot fallback for
  any language combination the SDK exposes; LLM-driven translation is also
  selectable per conversation.
- **P2P model distribution** via Hyperswarm registry with **HTTPS fallback**
  to HuggingFace. TTS fallback handles split `.onnx` + `.onnx_data` files
  correctly by pre-downloading with original filenames.
- **Voice activity detection** based on `expo-av` metering with configurable
  speech/silence thresholds; the parakeet streaming path uses Silero VAD
  for sub-second endpointing.
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
npm install --legacy-peer-deps
npx expo prebuild
```

> `--legacy-peer-deps` is required because some of the bare-* runtime
> packages declare strict peer ranges that npm 10's strict resolver rejects
> without it. CI uses the same flag.

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
│   │                bootstrap.ts — registers adapters into the container,
│   │                SystemTtsService — expo-speech adapter selected at
│   │                runtime when AppSettings.ttsEngine === 'system')
│   └── desktop/     Node adapters (NodeFileSystem, JsonFileKeyValueStore,
│                    NodeSqliteDatabase, NoopHaptics,
│                    AlwaysGrantedPermissions) + Electron IPC audio bridge
│                    (IpcAudioRecorder/Player main-side,
│                    WebAudioRecorder/Player renderer-side)
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
   implementing the eight ports (`IAudioRecorder`, `IAudioPlayer`,
   `IFileSystem`, `IKeyValueStore`, `IDatabase`, `IHaptics`, `IPermissions`,
   `INetworkInfo`) and writing a matching `bootstrap.ts` that calls
   `registerPlatform()` from `@core/platform/PlatformContainer`.
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
| TTS  | `supertonic2`       | `system` (device-native, selected via `AppSettings.ttsEngine`) |

---

## Compatibility & upstream contributions

JarvisQ tracks **`@qvac/sdk` 0.9.x**. The SDK is loaded as a regular
dependency and kept unforked. Two small files in `patches/` are applied via
`patch-package` on `postinstall` for targeted upstream fixes; they are
refreshed or dropped on each SDK bump, never grown into a wrapper layer.

The parakeet streaming + Silero VAD work that JarvisQ relies on is an
in-flight upstream contribution to `tetherto/qvac`. It is maintained as a
five-patch series in [`docs/qvac-patches/`](docs/qvac-patches/) (exported
with `git format-patch` from the
[`Helldez/qvac@feat/parakeet-streaming-silero-vad`](https://github.com/Helldez/qvac/tree/feat/parakeet-streaming-silero-vad)
branch). Once the series is merged upstream and a release ships on npm, the
`patches/` directory and `docs/qvac-patches/` will be removed in a single
SDK-bump commit.

---

## Contributing

Run the checks before opening a PR:

```bash
npm run typecheck
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full flow and
[AGENTS.md](AGENTS.md) for the architectural rules (English code only,
core platform-free, port-first design, additive refactors).

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Third-party model weights downloaded at runtime are governed by their own
upstream licenses; see each model card on Hugging Face.
