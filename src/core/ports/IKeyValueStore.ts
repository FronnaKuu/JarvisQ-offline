// ─── Key-Value Store Port ────────────────────────────────────────────────────
// Minimal contract for persisting small, user-scoped state (settings, model
// selection, feature flags). Adapters: AsyncStorage (mobile), localStorage
// (web), fs-backed JSON (desktop/Electron/Tauri).

export interface IKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
