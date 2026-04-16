// ---- Download Progress ---------------------------------------------------

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';
import type { DownloadProgress } from '@domain/types';

interface Props {
  label: string;
  progress: DownloadProgress | null;
  isDone: boolean;
}

export function DownloadProgressItem({ label, progress, isDone }: Props) {
  const pct = progress ? Math.round(progress.percentage) : 0;
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Text variant="bodyMedium" style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="bodySmall" style={styles.size}>
          {isDone ? '\u2713' : `${pct}%`}
        </Text>
      </View>
      {!isDone && (
        <ProgressBar
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
