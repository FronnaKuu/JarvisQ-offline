// ─── Chat Bubble ──────────────────────────────────────────────────────────────

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { Message } from '@domain/types';

interface Props {
  message: Message;
}

export function ChatBubble({ message }: Props) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text
          style={[styles.text, message.isStreaming && styles.streaming]}
          variant="bodyMedium"
        >
          {message.text || (message.isStreaming ? '…' : '')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  wrapperUser: {
    alignItems: 'flex-end',
  },
  wrapperAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: '#2B2BFF',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#1A1A24',
    borderBottomLeftRadius: 4,
  },
  text: {
    color: '#E4E1E6',
    lineHeight: 22,
  },
  streaming: {
    opacity: 0.75,
  },
});
