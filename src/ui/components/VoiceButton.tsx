// ---- Voice Button --------------------------------------------------------
// Shows pipeline phase with color + animated ring.
// During LISTENING: ring scale reflects real microphone amplitude (dBFS).

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';
import { getPlatform } from '@core/platform/PlatformContainer';
import type { PipelinePhase } from '@domain/types';

interface Props {
  phase: PipelinePhase;
  amplitude?: number;
  onPress: () => void;
}

const PHASE_COLORS: Record<PipelinePhase, string> = {
  IDLE: AppTheme.colors.status.idle,
  LISTENING: AppTheme.colors.status.listening,
  THINKING: AppTheme.colors.status.thinking,
  SPEAKING: AppTheme.colors.status.speaking,
};

const PHASE_LABELS: Record<PipelinePhase, string> = {
  IDLE: 'Tap to speak',
  LISTENING: 'Listening...',
  THINKING: 'Thinking...',
  SPEAKING: 'Tap to interrupt',
};

const PHASE_ICONS: Record<PipelinePhase, string> = {
  IDLE: 'microphone',
  LISTENING: 'microphone',
  THINKING: 'dots-horizontal',
  SPEAKING: 'volume-high',
};

const AMPLITUDE_MIN_DB = -60;
const AMPLITUDE_MAX_DB = -10;
const RING_SCALE_RANGE = 0.5;

const BUTTON_SIZE = 80;
const RING_SIZE = 108;

function dbToScale(db: number): number {
  const clamped = Math.max(AMPLITUDE_MIN_DB, Math.min(AMPLITUDE_MAX_DB, db));
  const normalized =
    (clamped - AMPLITUDE_MIN_DB) / (AMPLITUDE_MAX_DB - AMPLITUDE_MIN_DB);
  return 1.0 + normalized * RING_SCALE_RANGE;
}

export function VoiceButton({ phase, amplitude = -160, onPress }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (phase === 'LISTENING') {
      Animated.spring(scaleAnim, {
        toValue: dbToScale(amplitude),
        useNativeDriver: true,
        speed: 40,
        bounciness: 2,
      }).start();
    } else {
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [phase, amplitude, scaleAnim]);

  useEffect(() => {
    if (phase === 'THINKING' || phase === 'SPEAKING') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseLoop.current = null;
      pulseAnim.setValue(1);
    }
  }, [phase, pulseAnim]);

  const color = PHASE_COLORS[phase];
  const ringScale = phase === 'LISTENING' ? scaleAnim : pulseAnim;
  const isInteractive = phase === 'IDLE' || phase === 'LISTENING';

  const handlePress = () => {
    if (!isInteractive) return;
    getPlatform().haptics.impact('medium');
    onPress();
  };

  const showRing = phase !== 'IDLE';

  return (
    <View style={styles.container}>
      <View style={styles.buttonWrap}>
        {showRing && (
          <Animated.View
            style={[
              styles.ring,
              { borderColor: color, transform: [{ scale: ringScale }] },
            ]}
          />
        )}
        <TouchableOpacity
          onPress={handlePress}
          disabled={!isInteractive}
          style={[styles.button, { backgroundColor: color }]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={PHASE_LABELS[phase]}
          accessibilityState={{ disabled: !isInteractive, busy: phase === 'THINKING' }}
        >
          <Icon source={PHASE_ICONS[phase]} size={32} color={AppTheme.colors.onPrimary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.label} variant="labelMedium">
        {PHASE_LABELS[phase]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: AppTheme.spacing.md },
  buttonWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    opacity: 0.35,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  label: {
    color: AppTheme.colors.onSurfaceVariant,
    letterSpacing: 0.5,
  },
});
