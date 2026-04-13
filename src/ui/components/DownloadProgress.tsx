// ─── Download Progress ────────────────────────────────────────────────────────

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import type { DownloadProgress } from '@domain/types';

interface Props {
  label: string;
  progress: DownloadProgress | null;
  isDone: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DownloadProgressItem({ label, progress, isDone }: Props) {
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Text variant="bodyMedium" style={styles.label}>
          {isDone ? '✓ ' : ''}{label}
        </Text>
        {progress && !isDone && (
          <Text variant="bodySmall" style={styles.size}>
            {formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.totalBytes)}
          </Text>
        )}
      </View>
      {!isDone && (
        <ProgressBar
          progress={progress ? progress.percentage / 100 : 0}
          style={styles.bar}
          color="#7B9EFF"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: 6,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#E4E1E6',
  },
  size: {
    color: '#908F9A',
  },
  bar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1A1A24',
  },
});
