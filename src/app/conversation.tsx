// ---- Conversation Screen -------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform as RNPlatform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, IconButton, Menu, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChatBubble } from '@ui/components/ChatBubble';
import { VoiceButton } from '@ui/components/VoiceButton';
import { TextComposer } from '@ui/components/TextComposer';
import { VoicePipeline } from '@core/pipeline/VoicePipeline';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';
import { SystemTtsService } from '@platform/mobile/SystemTtsService';
import { Platform } from '@platform/mobile/Platform';
import { useConversationStore } from '@domain/ConversationStore';
import { useSettingsStore } from '@domain/SettingsStore';
import { AppTheme } from '@ui/theme/theme';
import type { Message, PipelinePhase } from '@domain/types';

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [atBottom, setAtBottom] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
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

    const tts = settings.ttsEngine === 'system' ? SystemTtsService : TtsService;
    const pipeline = new VoicePipeline(
      {
        services: { stt: SttService, llm: LlmService, tts },
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
        },
      },
      {
        systemPrompt: activeConversation?.systemPrompt ?? settings.llmSystemPrompt,
        maxTokens: activeConversation?.maxResponseTokens ?? settings.llmMaxTokens,
        temperature: activeConversation?.temperature ?? settings.llmTemperature,
        ttsBufferMode: settings.ttsBufferMode,
        ttsOptions: {
          speed: activeConversation?.ttsSpeed ?? settings.ttsSpeed,
          pitch: settings.ttsPitch,
          language: settings.ttsSystemLanguage,
        },
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
    else if (phase === 'SPEAKING') void p.interrupt();
  }, [phase]);

  const handleRetry = useCallback(() => {
    setPipelineError(null);
    const p = pipelineRef.current;
    if (p && phase === 'IDLE') void p.startListening();
  }, [phase]);

  const handleNewConversation = useCallback(async () => {
    void pipelineRef.current?.stopListening();
    pipelineRef.current?.clearHistory();
    await createConversation();
  }, [createConversation]);

  const handleTextSubmit = useCallback((text: string) => {
    const p = pipelineRef.current;
    if (!p) return;
    void p.sendText(text);
  }, []);

  const toggleInputMode = useCallback(() => {
    setInputMode((m) => {
      const next = m === 'voice' ? 'text' : 'voice';
      const p = pipelineRef.current;
      if (p) {
        if (next === 'text') void p.stopListening();
        p.setSilentMode(next === 'text');
      }
      return next;
    });
  }, []);

  const showPartial =
    partialText.length > 0 && (phase === 'LISTENING' || phase === 'THINKING');
  const displayMessages: Message[] = useMemo(() => {
    if (!showPartial) return messages;
    return [
      ...messages,
      {
        id: '__partial__',
        conversationId: activeConversation?.id ?? '',
        role: 'user',
        text: partialText,
        timestampMs: Date.now(),
        isStreaming: true,
      },
    ];
  }, [messages, showPartial, partialText, activeConversation?.id]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <ChatBubble message={item} />,
    [],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Appbar.Header style={styles.header} elevated={false} statusBarHeight={0}>
        <Appbar.Content
          title="JarvisQVAC"
          titleStyle={styles.headerTitle}
          subtitle={activeConversation?.title}
          subtitleStyle={styles.headerSubtitle}
        />
        <IconButton
          icon={inputMode === 'voice' ? 'keyboard-outline' : 'microphone-outline'}
          iconColor={AppTheme.colors.onBackground}
          onPress={toggleInputMode}
          accessibilityLabel={
            inputMode === 'voice' ? 'Switch to text input' : 'Switch to voice input'
          }
        />
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              iconColor={AppTheme.colors.onBackground}
              onPress={() => setMenuVisible(true)}
              accessibilityLabel="Open menu"
            />
          }
        >
          <Menu.Item
            leadingIcon="plus"
            title="New conversation"
            onPress={() => { setMenuVisible(false); void handleNewConversation(); }}
          />
          <Menu.Item
            leadingIcon="format-list-bulleted"
            title="History"
            onPress={() => { setMenuVisible(false); router.push('/conversations'); }}
          />
          <Menu.Item
            leadingIcon="cog-outline"
            title="Settings"
            onPress={() => { setMenuVisible(false); router.push('/settings'); }}
          />
        </Menu>
      </Appbar.Header>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
      >
      <FlatList
        ref={listRef}
        data={displayMessages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={[
          styles.chatContent,
          displayMessages.length === 0 && styles.chatContentEmpty,
        ]}
        style={styles.chatList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {inputMode === 'voice'
                ? 'Tap the microphone to start'
                : 'Type a message to start'}
            </Text>
          </View>
        }
        onScroll={({ nativeEvent }) => {
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          const distanceFromBottom =
            contentSize.height - (contentOffset.y + layoutMeasurement.height);
          setAtBottom(distanceFromBottom < 32);
        }}
        scrollEventThrottle={64}
      />

      {!atBottom && messages.length > 0 ? (
        <IconButton
          icon="chevron-double-down"
          mode="contained"
          size={20}
          style={styles.scrollToBottom}
          accessibilityLabel="Scroll to latest"
          onPress={() => listRef.current?.scrollToEnd({ animated: true })}
        />
      ) : null}

      <View
        style={[
          styles.controls,
          { paddingBottom: AppTheme.spacing.sm + insets.bottom },
        ]}
      >
        {inputMode === 'voice' ? (
          <VoiceButton phase={phase} amplitude={amplitude} onPress={handleVoicePress} />
        ) : (
          <TextComposer
            disabled={phase !== 'IDLE'}
            onSubmit={handleTextSubmit}
          />
        )}
      </View>
      </KeyboardAvoidingView>

      <Snackbar
        visible={pipelineError !== null}
        onDismiss={() => setPipelineError(null)}
        style={styles.snackbar}
        action={{
          label: 'Retry',
          onPress: handleRetry,
        }}
      >
        {pipelineError ?? ''}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppTheme.colors.background },
  flex: { flex: 1 },
  header: {
    backgroundColor: AppTheme.colors.background,
    elevation: 0,
    height: 48,
  },
  headerTitle: {
    color: AppTheme.colors.onBackground,
    fontSize: AppTheme.typography.titleMedium.fontSize,
    fontWeight: AppTheme.typography.titleMedium.fontWeight,
  },
  headerSubtitle: {
    color: AppTheme.colors.outline,
    fontSize: AppTheme.typography.bodySmall.fontSize,
  },
  chatList: { flex: 1 },
  chatContent: {
    paddingVertical: AppTheme.spacing.md,
    paddingBottom: AppTheme.spacing.xl,
  },
  chatContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    padding: AppTheme.spacing.xl,
  },
  emptyText: {
    color: AppTheme.colors.outline,
    textAlign: 'center',
  },
  snackbar: {
    backgroundColor: AppTheme.colors.errorContainer,
  },
  scrollToBottom: {
    position: 'absolute',
    right: AppTheme.spacing.lg,
    bottom: 160,
    backgroundColor: AppTheme.colors.surfaceVariant,
  },
  controls: {
    paddingTop: AppTheme.spacing.md,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppTheme.colors.surfaceVariant,
  },
});
