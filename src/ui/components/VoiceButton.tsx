// ---- Voice Button --------------------------------------------------------
// Shows pipeline phase with color + animated ring.
// During LISTENING: ring scale reflects real microphone amplitude (dBFS).

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';
import type { PipelinePhase } from '@domain/types';

interface Props {
  phase: PipelinePhase;
  amplitude?: number;
  onPress: () => void;
}

const PHASE_COLORS: Record<PipelinePhase, string> = {
  IDLE: AppTheme.colors.primary,
  LISTENING: '#FF5252',
  THINKING: '#FFB74D',
  SPEAKING: '#69F0AE',
};

const PHASE_LABELS: Record<PipelinePhase, string> = {
  IDLE: 'Tap to speak',
  LISTENING: 'Listening...',
  THINKING: 'Thinking...',
  SPEAKING: 'Speaking...',
};

const PHASE_ICONS: Record<PipelinePhase, string> = {
  IDLE: '\u{1F3A4}',
  LISTENING: '\u{1F534}',
  THINKING: '\u26A1',
  SPEAKING: '\u{1F50A}',
};

function dbToScale(db: number): number {
  const clamped = Math.max(-60, Math.min(-10, db));
  return 1.0 + ((clamped + 60) / 50) * 0.5;
}

export function VoiceButton({ phase, amplitude = -160, onPress }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (phase === 'LISTENING') {
      const target = dbToScale(amplitude);
      Animated.spring(scaleAnim, {
        toValue: target,
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

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.ring,
          { borderColor: color, transform: [{ scale: ringScale }] },
        ]}
      />
      <TouchableOpacity
        onPress={isInteractive ? onPress : undefined}
        style={[styles.button, { backgroundColor: color }]}
        activeOpacity={0.8}
      >
        <Text style={styles.icon}>{PHASE_ICONS[phase]}</Text>
      </TouchableOpacity>
      <Text style={styles.label} variant="labelMedium">
        {PHASE_LABELS[phase]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    opacity: 0.45,
  },
  button: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  icon: { fontSize: 28 },
  label: { color: AppTheme.colors.onSurfaceVariant, letterSpacing: 0.5 },
});
