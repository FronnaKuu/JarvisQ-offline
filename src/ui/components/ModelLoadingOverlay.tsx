// ---- Model Loading Overlay -----------------------------------------------
// Blocks user interaction while the responder model (LLM or translator) is
// being downloaded and loaded into memory. Surfaces progress so the user
// can tell whether the wait is meaningful (download in flight) or stalled.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, ProgressBar, Text } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';
import type { ServiceProgressSnapshot } from '@core/bootstrap/AppBootstrap';

interface Props {
  visible: boolean;
  /** Human-readable model label, e.g. "Qwen3 1.7B Q4 (~1.1 GB)". */
  label: string;
  /** Latest download progress snapshot, or null while the load has not yet
   *  reported any bytes (P2P peer discovery, file open, native load). */
  progress?: ServiceProgressSnapshot | null;
}

const MB = 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(2)} GB`;
  return `${(bytes / MB).toFixed(0)} MB`;
}

export function ModelLoadingOverlay({ visible, label, progress }: Props) {
  if (!visible) return null;
  const title = label.length > 0 ? `Loading ${label}…` : 'Loading model…';
  const hasBytes = progress !== null && progress !== undefined && progress.totalBytes > 0;
  const pct = hasBytes ? Math.round(progress!.percentage) : 0;

  return (
    <View style={styles.backdrop} pointerEvents="auto">
      <View style={styles.card}>
        <ActivityIndicator size="large" color={AppTheme.colors.primary} />
        <Text variant="bodyMedium" style={styles.title}>
          {title}
        </Text>
        {hasBytes ? (
          <>
            <ProgressBar
              progress={Math.min(1, progress!.percentage / 100)}
              style={styles.bar}
              color={AppTheme.colors.primary}
            />
            <Text variant="bodySmall" style={styles.subtitle}>
              {`${pct}% — ${formatBytes(progress!.bytesDownloaded)} / ${formatBytes(progress!.totalBytes)}`}
            </Text>
          </>
        ) : (
          <Text variant="bodySmall" style={styles.subtitle}>
            Connecting to model registry…
          </Text>
        )}
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
    minWidth: 260,
  },
  title: {
    color: AppTheme.colors.onSurface,
    textAlign: 'center',
  },
  subtitle: {
    color: AppTheme.colors.outline,
    textAlign: 'center',
  },
  bar: {
    height: 4,
    width: 220,
    borderRadius: AppTheme.radius.sm,
    backgroundColor: AppTheme.colors.surfaceVariant,
  },
});
