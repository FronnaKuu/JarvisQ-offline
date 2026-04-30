// ---- Model Loading Overlay -----------------------------------------------
// Blocks user interaction while the responder model (LLM or translator) is
// being loaded into memory by the bare runtime. The first dictation session
// after app launch was perceived as broken because parakeet decode is
// serialized on the same worker that hot-loads the LLM — STT frames pile up
// for ~15 s with no visible feedback. This overlay surfaces that wait.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';

interface Props {
  visible: boolean;
  /** Human-readable model label, e.g. "Qwen3 1.7B". Empty string falls back. */
  label: string;
}

export function ModelLoadingOverlay({ visible, label }: Props) {
  if (!visible) return null;
  const title = label.length > 0 ? `Loading ${label}…` : 'Loading model…';
  return (
    <View style={styles.backdrop} pointerEvents="auto">
      <View style={styles.card}>
        <ActivityIndicator size="large" color={AppTheme.colors.primary} />
        <Text variant="bodyMedium" style={styles.title}>
          {title}
        </Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          First-time load can take several seconds
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: AppTheme.colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
  },
  card: {
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radius.lg,
    paddingHorizontal: AppTheme.spacing.xl,
    paddingVertical: AppTheme.spacing.lg,
    alignItems: 'center',
    gap: AppTheme.spacing.md,
    minWidth: 220,
  },
  title: {
    color: AppTheme.colors.onSurface,
    textAlign: 'center',
  },
  subtitle: {
    color: AppTheme.colors.outline,
    textAlign: 'center',
  },
});
