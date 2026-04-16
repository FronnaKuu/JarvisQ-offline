# Instructions for AI coding agents

This file is the contract between the JarvisQVAC codebase and any AI agent
(Claude Code, Cursor, etc.) asked to make changes. Read it fully before
touching files.

## Project in one paragraph

JarvisQVAC is an Expo + React Native consumer of the Tether **`@qvac/sdk`**
that ships an on-device voice assistant (STT → LLM → TTS). The codebase
follows hexagonal / ports-and-adapters architecture so the same core can power
mobile today and desktop (Windows / macOS / Linux) tomorrow. See `README.md`
for the full architecture map.

## Non-negotiable rules

1. **Do not fork or wrap `@qvac/sdk`.** It is consumed directly from
   `node_modules`. Upgrading must remain a `package.json` bump — never add a
   compatibility shim that requires maintenance on SDK updates.
2. **`src/core/` is platform-free.** No `expo-*`, `react-native-*`,
   `@react-native-*`, Node-only, or Bare-only imports are permitted in
   `src/core/`. New capabilities enter the core only through a port under
   `src/core/ports/`; the concrete implementation lives in
   `src/platform/<target>/`.
3. **No hardcoded paths or constants at call sites.** Paths derive from
   `IFileSystem.documentDirectory` and `AppConfig`. Model URLs live in
   `src/core/config/HttpModelSources.ts`; model selection lives in
   `src/core/config/ModelConfig.ts`.
4. **English code and comments only.** Identifiers, comments, commit
   messages, PR descriptions — all English. User-facing UI copy is the only
   exception.
5. **Android works and must keep working.** Verify with `npm run typecheck`
   at minimum. Do not remove the Expo mobile adapters or the
   `bootstrapMobile()` wire-up.
6. **Additive refactors.** When introducing a port, keep the existing public
   call surface stable where practical so feature work and infra work can be
   reviewed independently.

## Where to add things

| Change | Location |
|--------|----------|
| New on-device capability (e.g. embeddings) | `src/core/inference/` + a port if it has platform-specific parts |
| New persisted data | `src/data/repositories/` (uses `IDatabase`) |
| New user setting | `src/domain/SettingsStore.ts` + `src/domain/types.ts` |
| New screen | `src/app/` (Expo Router file) |
| New shared UI primitive | `src/ui/components/` |
| New platform target | new folder under `src/platform/<target>/` with adapters + `bootstrap.ts` |
| New HTTP model URL | `src/core/config/HttpModelSources.ts` (pin a commit SHA) |

## Ports cheat-sheet

The following live under `src/core/ports/`. Keep their surface minimal — only
add methods when a real consumer needs them.

- `IAudioRecorder` — microphone + VAD.
- `IAudioPlayer` — PCM output.
- `IFileSystem` — `getInfo`, `makeDirectory`, `move`, `download`,
  `documentDirectory`.
- `IKeyValueStore` — `getItem` / `setItem` / `removeItem`.
- `IDatabase` — `exec`, `run`, `getFirst`, `getAll`.

Resolve adapters at runtime through `getPlatform()` from
`@core/platform/PlatformContainer` — never `new ExpoX()` from a core file.

## Verification before committing

```bash
npm run typecheck
```

If UI changed, manually validate on an Android device; automated UI tests do
not exist yet. Release build command:

```bash
npx expo run:android --variant release
```

## Commit style

Conventional Commits. Use `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
Subject under 70 chars. Body explains **why**, not what. Co-author trailer
when a model assisted:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

## What NOT to do

- Do not add generic "utility" files in `src/core/utils/` that reach into
  platform APIs — that is how leaks start.
- Do not reintroduce `ModelDownloader` / `ModelStorage`: the SDK's registry
  handles downloads; HTTP fallback lives in `downloadTtsWithCompanions` and
  in per-service fallback paths.
- Do not swap singletons for services that should be request-scoped. Pass
  adapters in via method arguments (e.g. `TtsService.load(config, { fileSystem })`)
  when the dependency is only needed for that call.
- Do not silently catch errors to hide symptoms. Fix root causes; surface
  unexpected failures.
