// ---- Fetch-based Network Probe -------------------------------------------
// Platform-neutral implementation of INetworkInfo relying on the global
// `fetch` + `AbortController`, both of which are available in React Native
// (Hermes) and in Node 18+. Mobile and desktop bootstraps share it so the
// probe logic does not diverge across targets.

import { AppConfig } from '@core/config/AppConfig';
import type { INetworkInfo } from '@core/ports/INetworkInfo';

export class FetchNetworkInfo implements INetworkInfo {
  async isOnline(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      AppConfig.network.probeTimeoutMs,
    );
    try {
      const response = await fetch(AppConfig.network.probeUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      return response.ok || (response.status >= 200 && response.status < 400);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
