// ---- RN Vibration Haptics (Mobile) ---------------------------------------
// Minimal haptics implementation backed by React Native's built-in Vibration
// module. We intentionally avoid expo-haptics to keep the mobile footprint
// lean; patterns below approximate iOS UIImpactFeedbackGenerator levels.

import { Vibration } from 'react-native';
import type {
  HapticImpact,
  HapticNotification,
  IHaptics,
} from '@core/ports/IHaptics';

const IMPACT_DURATION_MS: Record<HapticImpact, number> = {
  light: 10,
  medium: 20,
  heavy: 35,
};

const NOTIFICATION_PATTERN_MS: Record<HapticNotification, number[]> = {
  success: [0, 15],
  warning: [0, 20, 60, 20],
  error: [0, 35, 80, 35],
};

const SELECTION_DURATION_MS = 8;

export class RnVibrationHaptics implements IHaptics {
  impact(level: HapticImpact): void {
    try {
      Vibration.vibrate(IMPACT_DURATION_MS[level]);
    } catch {
      // no-op on devices without a vibrator
    }
  }

  notify(kind: HapticNotification): void {
    try {
      Vibration.vibrate(NOTIFICATION_PATTERN_MS[kind]);
    } catch {
      // no-op
    }
  }

  selection(): void {
    try {
      Vibration.vibrate(SELECTION_DURATION_MS);
    } catch {
      // no-op
    }
  }
}
