// ---- Haptics Port ---------------------------------------------------------
// Platform-agnostic tactile feedback. Adapters must treat unsupported hardware
// (no vibrator, user-disabled) as a silent no-op — never throw.

export type HapticImpact = 'light' | 'medium' | 'heavy';
export type HapticNotification = 'success' | 'warning' | 'error';

export interface IHaptics {
  impact(level: HapticImpact): void;
  notify(kind: HapticNotification): void;
  selection(): void;
}
