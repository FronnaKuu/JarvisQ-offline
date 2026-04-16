// ---- Conversation Screen -------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, View } from 'react-native';
import { Appbar, IconButton, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { ChatBubble } from '@ui/components/ChatBubble';
import { VoiceButton } from '@ui/components/VoiceButton';
import { VoicePipeline } from '@core/pipeline/VoicePipeline';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';
import { Platform } from '@platform/mobile/Platform';
import { useConversationStore } from '@domain/ConversationStore';
import { useSettingsStore } from '@domain/SettingsStore';
import { AppTheme } from '@ui/theme/theme';
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
  const [amplitude, setAmplitude] = useState(-160);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const assistantMsgIdRef = useRef<string | null>(null);
  const pipelineRef = useRef<VoicePipeline | null>(null);
  const llmFullTextRef = useRef('');

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  useEffect(() => {
    const recorder = Platform.createAudioRecorder({
      onStateChange: () => {},
      onAmplitude: (db) => setAmplitude(db),
    });
    const audioPlayer = Platform.createAudioPlayer();

    const pipeline = new VoicePipeline(
      {
        services: { stt: SttService, llm: LlmService, tts: TtsService },
        recorder,
        audioPlayer,
      },
      {
        onPhaseChange: (p) => {
          setPhase(p);
          if (p === 'THINKING') setPartialText('');
        },
        onAmplitude: (db) => setAmplitude(db),
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
        onLlmDone: async () => {
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
        systemPrompt: activeConversation?.systemPrompt ?? settings.llmSystemPrompt,
        maxTokens: activeConversation?.maxResponseTokens ?? settings.llmMaxTokens,
        temperature: activeConversation?.temperature ?? settings.llmTemperature,
      },
    );

    pipelineRef.current = pipeline;
    return () => { void pipeline.stopListening(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVoicePress = useCallback(() => {
    const p = pipelineRef.current;
    if (!p) return;
    if (phase === 'LISTENING') void p.stopListening();
    else if (phase === 'IDLE') void p.startListening();
  }, [phase]);

  const handleNewConversation = useCallback(async () => {
    void pipelineRef.current?.stopListening();
    pipelineRef.current?.clearHistory();
    await createConversation();
  }, [createConversation]);

  const displayMessages: Message[] =
    partialText && phase === 'THINKING'
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
        <IconButton icon="plus" iconColor={AppTheme.colors.onBackground} onPress={() => void handleNewConversation()} />
        <IconButton icon="cog" iconColor={AppTheme.colors.onBackground} onPress={() => router.push('/settings')} />
      </Appbar.Header>

      <FlatList
        ref={listRef}
        data={displayMessages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={styles.chatContent}
        style={styles.chatList}
      />

      {pipelineError ? (
        <View style={styles.errorBanner}>
          <Text variant="bodySmall" style={styles.errorText}>{pipelineError}</Text>
        </View>
      ) : null}

      <View style={styles.controls}>
        <VoiceButton phase={phase} amplitude={amplitude} onPress={handleVoicePress} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppTheme.colors.background },
  header: { backgroundColor: AppTheme.colors.background, elevation: 0 },
  headerTitle: { color: AppTheme.colors.onBackground, fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: AppTheme.colors.outline, fontSize: 12 },
  chatList: { flex: 1 },
  chatContent: { paddingVertical: 12, paddingBottom: 24 },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: AppTheme.colors.onError,
    borderRadius: 8,
    padding: 10,
  },
  errorText: { color: AppTheme.colors.error, textAlign: 'center' },
  controls: {
    paddingBottom: 40,
    paddingTop: 20,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppTheme.colors.surfaceVariant,
  },
});
