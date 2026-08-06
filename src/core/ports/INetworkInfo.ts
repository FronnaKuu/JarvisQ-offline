// ---- Network Info Port ---------------------------------------------------
// Minimal connectivity probe. Implementations must answer quickly (bounded
// timeout) and must not throw — surface failures as `false`.
//
// Offline-first contract: `isOnline()` only answers the question the app
// actually cares about — "can we download models right now?" — and it must be
// cheap. Implementations SHOULD cache the last probe result (FetchNetworkInfo
// does, module-wide) so a cold launch performs at most ONE real network
// round-trip regardless of how many callers ask. When every model is already
// on disk, the platform bootstrap should skip the probe entirely and go
// straight to local load (AppBootstrap now loads cache-first).

export interface INetworkInfo {
  isOnline(): Promise<boolean>;

  /** Optional: force a fresh probe, bypassing any cached result. */
  refresh?(): Promise<boolean>;

  /** Optional: drop cached probe results so the next isOnline() re-probes. */
  invalidate?(): void;
}
