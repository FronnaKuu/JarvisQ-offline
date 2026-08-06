// ---- Fetch-based Network Probe -------------------------------------------
// Platform-neutral implementation of INetworkInfo relying on the global
// `fetch` + `AbortController`, both of which are available in React Native
// (Hermes) and in Node 18+. Mobile and desktop bootstraps share it so the
// probe logic does not diverge across targets.
//
// Offline-first: probe results are cached module-wide (keyed by probe URL)
// with a TTL, and concurrent callers coalesce onto a single in-flight probe.
// A cold app launch therefore performs at most ONE network round-trip even
// when STT, TTS, LLM and several UI screens each ask isOnline() during boot.

import { AppConfig } from '@core/config/AppConfig';
import type { INetworkInfo } from '@core/ports/INetworkInfo';

/** How long a probe result is trusted before a re-probe is allowed. */
const DEFAULT_CACHE_TTL_MS = 60_000;

interface ProbeCacheEntry {
  result: boolean;
  probedAt: number;
  inflight: Promise<boolean> | null;
}

// Module-level cache: guarantees a single probe per TTL across every
// FetchNetworkInfo instance the app may create.
const probeCache = new Map<string, ProbeCacheEntry>();

export interface FetchNetworkInfoOptions {
  /** Override the default probe-result TTL. */
  cacheTtlMs?: number;
  /**
   * Offline-first hook. When it resolves to `true`, isOnline() returns `true`
   * WITHOUT touching the network — used once the app knows every model is
   * already downloaded locally. Wire it to a persisted "models ready" flag
   * (written after the first successful bootstrap) so repeat launches never
   * perform a connectivity probe at all.
   */
  isLocallyReady?: () => Promise<boolean>;
}

export class FetchNetworkInfo implements INetworkInfo {
  private readonly cacheTtlMs: number;
  private readonly isLocallyReady?: () => Promise<boolean>;

  constructor(options: FetchNetworkInfoOptions = {}) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.isLocallyReady = options.isLocallyReady;
  }

  async isOnline(): Promise<boolean> {
    // Nothing left to download → the probe is pure waste; answer immediately.
    if (this.isLocallyReady) {
      try {
        if (await this.isLocallyReady()) return true;
      } catch {
        // Never let the hook break isOnline() — fall through to the probe.
      }
    }
    return this.probe();
  }

  /** Force a fresh probe, bypassing any cached result. */
  async refresh(): Promise<boolean> {
    return this.probe(true);
  }

  /** Drop cached probe results so the next isOnline() re-probes. */
  invalidate(): void {
    probeCache.delete(AppConfig.network.probeUrl);
  }

  private probe(force = false): Promise<boolean> {
    const url = AppConfig.network.probeUrl;
    const now = Date.now();
    const cached = probeCache.get(url);

    if (!force && cached && now - cached.probedAt < this.cacheTtlMs) {
      return Promise.resolve(cached.result);
    }

    // Coalesce concurrent callers onto the in-flight probe.
    if (cached?.inflight) return cached.inflight;

    const inflight = this.runProbe(url).finally(() => {
      const entry = probeCache.get(url);
      if (entry) entry.inflight = null;
    });

    // Stash the in-flight promise so concurrent callers share it. The real
    // result/probedAt are written by runProbe when the fetch settles.
    probeCache.set(url, { result: false, probedAt: now, inflight });
    return inflight;
  }

  private async runProbe(url: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      AppConfig.network.probeTimeoutMs,
    );
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });
      const ok = response.ok || (response.status >= 200 && response.status < 400);
      probeCache.set(url, { result: ok, probedAt: Date.now(), inflight: null });
      return ok;
    } catch {
      probeCache.set(url, { result: false, probedAt: Date.now(), inflight: null });
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
