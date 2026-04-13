// ─── Conversation Screen ──────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import { Appbar, IconButton, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { ChatBubble } from '@ui/components/ChatBubble';
import { VoiceButton } from '@ui/components/VoiceButton';
import { VoicePipeline } from '@core/pipeline/VoicePipeline';
import { useConversationStore } from '@domain/ConversationStore';
import { useSettingsStore } from '@domain/SettingsStore';
import type { Message, PipelinePhase } from '@domain/types';

export default function ConversationScreen() {
  const router = useRouter();
  const addUserMessage = useConversationStore((s) => s.addUserMessage);
  const addAssistantMessage = useConversationStore((s) => s.addAssistantMessage);
  const appendAssistantToken = useConversationStore((s) => s.appendAssistantToken);
  const finalizeAssistantMessage = useConversationStore((s) => s.finalizeAssistantMessage);
  const createConversation = useConversationStore((s) => s.createConversation);
  const messages = useConversationStore((s) => s.messages);
  const activeConversation = useConversationStore((s) => s.activeConversation());
  const settings = useSettingsStore((s) => s.settings);

  const [phase, setPhase] = useState<PipelinePhase>('IDLE');
  const [partialText, setPartialText] = useState('');
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const assistantMsgIdRef = useRef<string | null>(null);
  const pipelineRef = useRef<VoicePipeline | null>(null);
  const llmFullTextRef = useRef('');

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messages.length]);

  // Create pipeline once
  useEffect(() => {
    const pipeline = new VoicePipeline(
      {
        onPhaseChange: (p) => {
          setPhase(p);
          if (p === 'THINKING') setPartialText('');
        },
        onSttPartial: (text) => setPartialText(text),
        onSttFinal: async (text) => {
          setPartialText('');
          await addUserMessage(text);
          const msg = await addAssistantMessage();
          assistantMsgIdRef.current = msg.id;
          llmFullTextRef.current = '';
        },
        onLlmToken: async (token) => {
          if (assistantMsgIdRef.current) {
            llmFullTextRef.current += token;
            await appendAssistantToken(assistantMsgIdRef.current, token);
          }
        },
        onLlmDone: async (_fullText) => {
          if (assistantMsgIdRef.current) {
            await finalizeAssistantMessage(
              assistantMsgIdRef.current,
              llmFullTextRef.current,
            );
            assistantMsgIdRef.current = null;
          }
        },
        onError: (msg) => {
          setPipelineError(msg);
          setTimeout(() => setPipelineError(null), 4000);
        },
      },
      {
        systemPrompt:
          activeConversation?.systemPrompt ?? settings.llmSystemPrompt,
        maxTokens: activeConversation?.maxResponseTokens ?? settings.llmMaxTokens,
        temperature:
          activeConversation?.temperature ?? settings.llmTemperature,
        ttsSpeed: activeConversation?.ttsSpeed ?? settings.ttsSpeed,
        ttsVoice: settings.ttsVoice,
      },
    );
    pipelineRef.current = pipeline;

    return () => {
      pipeline.stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVoicePress = useCallback(() => {
    const pipeline = pipelineRef.current;
    if (!pipeline) return;
    if (phase === 'LISTENING') {
      pipeline.stopListening();
    } else if (phase === 'IDLE') {
      void pipeline.startListening();
    }
  }, [phase]);

  const handleNewConversation = useCallback(async () => {
    pipelineRef.current?.stopListening();
    pipelineRef.current?.clearHistory();
    await createConversation();
  }, [createConversation]);

  const displayMessages: Message[] =
    partialText && phase === 'LISTENING'
      ? [
          ...messages,
          {
            id: '__partial__',
            conversationId: activeConversation?.id ?? '',
            role: 'user',
            text: partialText,
            timestampMs: Date.now(),
            isStreaming: true,
          },
        ]
      : messages;

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.Content
          title="JarvisQVAC"
          titleStyle={styles.headerTitle}
          subtitle={activeConversation?.title}
          subtitleStyle={styles.headerSubtitle}
        />
        <IconButton
          icon="plus"
          iconColor="#E4E1E6"
          onPress={() => void handleNewConversation()}
        />
        <IconButton
          icon="cog"
          iconColor="#E4E1E6"
          onPress={() => router.push('/settings')}
        />
      </Appbar.Header>

      <FlatList
        ref={listRef}
        data={displayMessages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={styles.chatContent}
        style={styles.chatList}
      />

      {pipelineError && (
        <View style={styles.errorBanner}>
          <Text variant="bodySmall" style={styles.errorText}>
            {pipelineError}
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <VoiceButton phase={phase} onPress={handleVoicePress} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  header: {
    backgroundColor: '#0B0B0F',
    elevation: 0,
  },
  headerTitle: {
    color: '#E4E1E6',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#908F9A',
    fontSize: 12,
  },
  chatList: {
    flex: 1,
  },
  chatContent: {
    paddingVertical: 12,
    paddingBottom: 24,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#690005',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: '#FFB4AB',
    textAlign: 'center',
  },
  controls: {
    paddingBottom: 40,
    paddingTop: 20,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1A1A24',
  },
});
