// ─── Platform Container ──────────────────────────────────────────────────────
// Lightweight service locator holding the platform adapters wired up at app
// boot. The core layer (repositories, stores, pipeline) retrieves adapters via
// `getPlatform()` rather than importing Expo / RN modules directly.
//
// Design notes
// ------------
// * The registration happens exactly once, in the platform-specific bootstrap
//   (e.g. `src/platform/mobile/bootstrap.ts`). Attempting to read adapters
//   before registration throws, which surfaces wiring bugs early.
// * We intentionally avoid a full DI framework. For a small codebase a typed
//   locator gives us 95% of the benefit (swap-by-platform, test-time overrides)
//   with zero dependencies and no decorator gymnastics.

import type {
  IDatabase,
  IFileSystem,
  IKeyValueStore,
} from '@core/ports';

export interface PlatformAdapters {
  fileSystem: IFileSystem;
  keyValueStore: IKeyValueStore;
  database: IDatabase;
}

let adapters: PlatformAdapters | null = null;

export function registerPlatform(value: PlatformAdapters): void {
  adapters = value;
}

export function getPlatform(): PlatformAdapters {
  if (!adapters) {
    throw new Error(
      'PlatformContainer: no adapters registered. Call the platform bootstrap ' +
        'before using core services.',
    );
  }
  return adapters;
}

/** Testing hook: reset the container between test cases. */
export function __resetPlatformForTests(): void {
  adapters = null;
}
