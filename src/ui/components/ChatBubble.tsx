// ---- Chat Bubble ---------------------------------------------------------

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';
import { formatMessageTimestamp } from '@core/utils/formatTime';
import type { Message } from '@domain/types';

interface Props {
  message: Message;
}

function ChatBubbleImpl({ message }: Props) {
  const isUser = message.role === 'user';
  const isPartial = message.id === '__partial__';
  const timestampLabel = isPartial
    ? null
    : formatMessageTimestamp(message.timestampMs);

  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text
          style={[styles.text, message.isStreaming && styles.streaming]}
          variant="bodyMedium"
        >
          {message.text || (message.isStreaming ? '...' : '')}
        </Text>
      </View>
      {timestampLabel ? (
        <Text variant="labelSmall" style={styles.timestamp}>
          {timestampLabel}
        </Text>
      ) : null}
    </View>
  );
}

export const ChatBubble = React.memo(ChatBubbleImpl, (prev, next) => (
  prev.message.id === next.message.id &&
  prev.message.text === next.message.text &&
  prev.message.isStreaming === next.message.isStreaming
));

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: AppTheme.spacing.lg,
    paddingVertical: AppTheme.spacing.xs,
    gap: AppTheme.spacing.xxs,
  },
  wrapperUser: {
    alignItems: 'flex-end',
  },
  wrapperAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: AppTheme.spacing.md,
    paddingVertical: AppTheme.spacing.sm,
    borderRadius: AppTheme.radius.xl,
  },
  bubbleUser: {
    backgroundColor: AppTheme.colors.primaryContainer,
    borderBottomRightRadius: AppTheme.radius.sm,
  },
  bubbleAssistant: {
    backgroundColor: AppTheme.colors.surfaceVariant,
    borderBottomLeftRadius: AppTheme.radius.sm,
  },
  text: {
    color: AppTheme.colors.onBackground,
    lineHeight: 22,
  },
  streaming: {
    opacity: 0.75,
  },
  timestamp: {
    color: AppTheme.colors.outline,
    paddingHorizontal: AppTheme.spacing.xs,
  },
});
