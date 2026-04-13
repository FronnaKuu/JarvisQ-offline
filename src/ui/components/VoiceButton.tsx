// ─── Voice Button ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { PipelinePhase } from '@domain/types';

interface Props {
  phase: PipelinePhase;
  onPress: () => void;
}

const PHASE_COLORS: Record<PipelinePhase, string> = {
  IDLE: '#7B9EFF',
  LISTENING: '#FF5252',
  THINKING: '#FFB74D',
  SPEAKING: '#69F0AE',
};

const PHASE_LABELS: Record<PipelinePhase, string> = {
  IDLE: 'Tap to speak',
  LISTENING: 'Listening…',
  THINKING: 'Thinking…',
  SPEAKING: 'Speaking…',
};

export function VoiceButton({ phase, onPress }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (phase === 'LISTENING') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [phase, pulseAnim]);

  const color = PHASE_COLORS[phase];
  const isInteractive = phase === 'IDLE' || phase === 'LISTENING';

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.ring,
          { borderColor: color, transform: [{ scale: pulseAnim }] },
        ]}
      />
      <TouchableOpacity
        onPress={isInteractive ? onPress : undefined}
        style={[styles.button, { backgroundColor: color }]}
        activeOpacity={0.8}
      >
        <Text style={styles.icon} variant="headlineMedium">
          {phase === 'LISTENING' ? '🔴' : '🎤'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.label} variant="labelMedium">
        {PHASE_LABELS[phase]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
  },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    opacity: 0.4,
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
  icon: {
    fontSize: 28,
  },
  label: {
    color: '#C6C4CE',
    letterSpacing: 0.5,
  },
});
