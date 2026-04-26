// ---- Dictation Bubble ----------------------------------------------------
// Live transcription preview shown while the user is dictating. Renders the
// committed transcript and the still-open running partial as one bubble,
// with the partial dimmed via theme opacity to mirror HearoPilot's split.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';
import type { DictationView } from '@domain/types';

interface Props {
  view: DictationView;
}

function DictationBubbleImpl({ view }: Props) {
  const { committedText, runningPartial } = view;
  if (!committedText && !runningPartial) return null;

  const needsSeparator = committedText.length > 0 && runningPartial.length > 0;

  return (
    <View style={styles.wrapper}>
      <View style={styles.bubble}>
        <Text style={styles.text} variant="bodyMedium">
          {committedText}
          {needsSeparator ? ' ' : ''}
          {runningPartial ? (
            <Text style={styles.runningPartial}>{runningPartial}</Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

export const DictationBubble = React.memo(
  DictationBubbleImpl,
  (prev, next) =>
    prev.view.committedText === next.view.committedText &&
    prev.view.runningPartial === next.view.runningPartial,
);

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: AppTheme.spacing.lg,
    paddingVertical: AppTheme.spacing.xs,
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: AppTheme.spacing.md,
    paddingVertical: AppTheme.spacing.sm,
    borderRadius: AppTheme.radius.xl,
    borderBottomRightRadius: AppTheme.radius.sm,
    backgroundColor: AppTheme.colors.primaryContainer,
  },
  text: {
    color: AppTheme.colors.onBackground,
    lineHeight: 22,
  },
  runningPartial: {
    opacity: AppTheme.opacity.runningPartial,
    fontStyle: 'italic',
  },
});
