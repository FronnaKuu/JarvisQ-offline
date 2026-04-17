// ---- Download Progress ---------------------------------------------------

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';
import type { DownloadProgress } from '@domain/types';

type Phase = 'pending' | 'active' | 'done';

interface Props {
  label: string;
  progress: DownloadProgress | null;
  isDone: boolean;
  phase?: Phase;
}

function statusText(phase: Phase, pct: number, hasProgress: boolean): string {
  if (phase === 'done') return '\u2713';
  if (phase === 'pending') return 'Waiting';
  if (!hasProgress) return 'Loading\u2026';
  if (pct >= 100) return 'Finalizing\u2026';
  return `${pct}%`;
}

export function DownloadProgressItem({ label, progress, isDone, phase = 'pending' }: Props) {
  const pct = progress ? Math.round(progress.percentage) : 0;
  const effectivePhase: Phase = isDone ? 'done' : phase;
  const label2 = statusText(effectivePhase, pct, progress !== null);
  const indeterminate = effectivePhase === 'active' && progress === null;
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Text variant="bodyMedium" style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="bodySmall" style={styles.size}>
          {label2}
        </Text>
      </View>
      {!isDone && (
        <ProgressBar
          indeterminate={indeterminate}
          progress={progress ? progress.percentage / 100 : 0}
          style={styles.bar}
          color={AppTheme.colors.primary}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: AppTheme.spacing.xs,
    paddingVertical: AppTheme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppTheme.spacing.sm,
  },
  label: {
    color: AppTheme.colors.onBackground,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  size: {
    color: AppTheme.colors.outline,
    flexShrink: 0,
  },
  bar: {
    height: 4,
    borderRadius: AppTheme.radius.sm,
    backgroundColor: AppTheme.colors.surfaceVariant,
  },
});
