// ---- Desktop No-op Haptics -----------------------------------------------
// Desktop has no standardized vibration API; all calls are silent no-ops.

import type { IHaptics } from '@core/ports/IHaptics';

export class NoopHaptics implements IHaptics {
  impact(): void {}
  notify(): void {}
  selection(): void {}
}
