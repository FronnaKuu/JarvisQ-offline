# Changelog

All notable changes to JarvisQ are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/).

The pre-rename history below is preserved as-is for traceability; the project
was named **JarvisQVAC** until version 1.0.3, then renamed to **JarvisQ**.

## [Unreleased]

## [1.1.1] — 2026-05-05

### Fixed
- **Desktop audio capture** (`WebAudioRecorder`): when the OS-level
  microphone permission is denied or Sound Settings has the wrong default
  device, Chromium silently returns a live track that emits digital
  silence. Previously the pipeline waited the full 20 s `listenTimeoutMs`
  and went back to IDLE with no transcript. An early-silence probe now
  fires 2 s after capture starts: if the loudest frame is still below
  -85 dBFS it surfaces a descriptive error including the device label
  and the captured peak.
- **Desktop audio capture**: disabled Chromium's WebRTC AudioProcessingModule
  (`echoCancellation`, `noiseSuppression`, `autoGainControl`) which on
  certain Windows driver combinations — notably some AMD Audio Device
  array mics — emits silence even though the underlying device works in
  Windows' Voice Recorder. The VAD/STT chain downstream tolerates raw
  audio fine.

### CI
- Added Windows installer build job to the Release workflow alongside
  Android, with Defender exclusion to allow the unsigned NSIS installer
  through GitHub-hosted runners. Tagged releases now attach both the
  Android APK (`arm64-v8a`) and the Windows installer plus their SHA256
  sidecars.
- Switched the Android build to `arm64-v8a` only and freed ~14 GB on the
  ubuntu-latest runner to fix the out-of-disk failures that affected
  earlier release attempts.

### Docs
- README now carries License, CI, Release, and "Built with QVAC" badges.
- Fixed upstream QVAC repository links (`tetherto/qvac-sdk` →
  `tetherto/qvac`).

## [1.1.0] — 2026-05-03

### Changed
- Renamed the product from **JarvisQVAC** to **JarvisQ** to avoid implying
  affiliation with Tether's QVAC trademark. The display name, Android
  package id (`app.jarvisq.mobile`), and Electron `appId`
  (`app.jarvisq.desktop`) all reflect the new identity. Storage keys and the
  SQLite filename are kept under the legacy `jarvisqvac_*` prefix so existing
  installs retain their conversations and settings across the upgrade.
- Adopted the Apache License 2.0. Added `LICENSE` and `NOTICE` files.
- README rewritten with a Privacy & threat model section. The fork branch
  carrying the upstream parakeet-streaming contribution is now linked from
  the Compatibility section.

### Added
- Apache-2.0 license + NOTICE file.
- GitHub Actions CI: typecheck + Vitest on Node 20.
- Vitest unit-test suite for `ModelConfig.resolveTranslatorPair`,
  `ClauseStreamer`, and the SQLite row mappers.
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, GitHub issue and
  PR templates.

### Fixed
- Removed an unused `ttsProfile` declaration in `AppBootstrap.ensureAlwaysOn`
  that broke `tsc --noEmit` under `noUnusedLocals`.

## [1.0.3] — 2026-04-21

### Added
- First-class translation mode alongside conversation mode, with a per-chat
  responder (`LlmResponder` / `TranslationResponder`) and a `mode` column on
  `conversations`.
- Universal Bergamot translation coverage via English pivot for any pair the
  SDK exposes (`resolveTranslatorPair` in `ModelConfig.ts`).
- Hands-free streaming dictation using the parakeet streaming path: live PCM
  capture, Silero-VAD-driven endpointing, mid-segment partial decoding, and
  user-tunable auto-commit silence.
- Live dictation bubble UX inspired by HearoPilot.
- Mic mute toggle next to the voice button.
- Model-load overlay and ping-pong audio player to remove mid-clause
  dropouts during streaming TTS.
- Five-patch series under `docs/qvac-patches/` documenting the upstream
  contribution to `@qvac/transcription-parakeet` + `@qvac/sdk` (Silero VAD
  simulated streaming, mid-segment partials, tests, open-segment fix).

### Fixed
- Drain-grace recovery for the streaming STT path, post-boot TTS engine
  reload, and clause boundary scan that previously emitted only at end of
  buffer.
- TTS pipeline rebuild when the TTS engine setting changes.
- `onSpeakingDone` deferred until the TTS queue is truly empty.
- In-flight bootstrap loads deduplicated; RAM freed when switching
  conversation mode.
- Runtime system prompt is now authoritative over the persisted DB default.
- TTS/mic race during hands-free resume.

### Changed
- `androidLiveAudioSource` reverted to `VOICE_RECOGNITION` (6) for OnePlus
  CPH2769 and similar devices where the raw MIC source produces gain too
  low for Silero's default threshold.

## [1.0.2] — 2026-04 (consolidation release)

### Added
- Windows Electron shell hosting `VoicePipeline` in the main process, with a
  Web Audio renderer bridge for microphone capture and PCM playback. All
  eight ports implemented with zero native dependencies.
- Pluggable TTS engine (`supertonic` / `system`) selected via
  `AppSettings.ttsEngine`. The Settings screen exposes a shortcut to the
  Android system TTS settings.
- Streaming vs buffered TTS timing modes for low time-to-first-audio
  vs. weak-device stability.
- UX overhaul of the mobile chat surface and documented release-APK
  verification workflow (Hermes-bundle grep, splash diagnostics).

### Fixed
- Default capture switched to push-to-talk to avoid auto-looping the mic.
- Android capture switched from AMR-NB 8 kHz to AAC-M4A 16 kHz for
  Whisper-friendly consonant clarity.
- Migrated from the deprecated `transcribeStream()` to `transcribe()` for
  the file-mode STT path.

### Changed
- Bumped `@qvac/sdk` to 0.9.0 and aligned the plugin manifest. TTS migrated
  to the Supertonic 2 schema; the language whitelist now matches the
  officially supported set.
- Electron bundle trimmed: react-native, expo, and babel families excluded
  from the desktop installer.

## [1.0.1] — 2026-03 (architectural foundation)

### Added
- Cross-platform ports: `IFileSystem`, `IKeyValueStore`, `IDatabase`,
  `IAudioRecorder`, `IAudioPlayer`, `IHaptics`, `IPermissions`, `INetworkInfo`.
- HTTPS fallback for every model profile, with progress-stall detection in
  `loadWithFallback`.
- Parakeet STT support alongside Whisper.
- README, AGENTS.md describing the architectural rules (platform-free core,
  port-first design, additive refactors).

### Changed
- Migrated to `@qvac/sdk` with a clean DI architecture and amplitude-based
  VAD on top of `expo-av` metering.
- Replaced the custom Bare worklet path with the SDK's official API.
- Removed the legacy `ModelDownloader` / `ModelStorage` (the SDK registry
  handles downloads now).

## [1.0.0] — 2026-02 (initial release)

### Added
- Expo + React Native TypeScript scaffold.
- Initial JarvisQVAC voice-assistant pipeline with QVAC SDK as the inference
  backend.

[Unreleased]: https://github.com/Helldez/JarvisQ/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Helldez/JarvisQ/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/Helldez/JarvisQ/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/Helldez/JarvisQ/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Helldez/JarvisQ/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Helldez/JarvisQ/releases/tag/v1.0.0
