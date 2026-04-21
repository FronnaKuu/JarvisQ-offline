// ---- Conversation Screen -------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform as RNPlatform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, IconButton, Menu, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChatBubble } from '@ui/components/ChatBubble';
import { VoiceButton } from '@ui/components/VoiceButton';
import { TextComposer } from '@ui/components/TextComposer';
import { VoicePipeline } from '@core/pipeline/VoicePipeline';
import { LlmResponder } from '@core/pipeline/LlmResponder';
import { TranslationResponder } from '@core/pipeline/TranslationResponder';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TranslatorService } from '@core/inference/TranslatorService';
import { TtsService } from '@core/inference/TtsService';
import { SystemTtsService } from '@platform/mobile/SystemTtsService';
import { Platform } from '@platform/mobile/Platform';
import { useConversationStore } from '@domain/ConversationStore';
import { useBootstrapStore } from '@domain/BootstrapStore';
import { useSettingsStore } from '@domain/SettingsStore';
import { AppTheme } from '@ui/theme/theme';
import type { IResponder } from '@core/inference/types';
import type { Message, PipelinePhase } from '@domain/types';

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addUserMessage = useConversationStore((s) => s.addUserMessage);
  const addAssistantMessage = useConversationStore((s) => s.addAssistantMessage);
  const appendAssistantToken = useConversationStore((s) => s.appendAssistantToken);
  const finalizeAssistantMessage = useConversationStore((s) => s.finalizeAssistantMessage);
  const messages = useConversationStore((s) => s.messages);
  const activeConversation = useConversationStore((s) => s.activeConversation());
  const ensureResponder = useBootstrapStore((s) => s.ensureResponder);
  const settings = useSettingsStore((s) => s.settings);
  const mode = activeConversation?.mode ?? 'conversation';
  const sourceLang = activeConversation?.sourceLang ?? null;
  const targetLang = activeConversation?.targetLang ?? null;

  const [phase, setPhase] = useState<PipelinePhase>('IDLE');
  const [partialText, setPartialText] = useState('');
  const [amplitude, setAmplitude] = useState(-160);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [atBottom, setAtBottom] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [controlsHeight, setControlsHeight] = useState(0);
  // Session-level mic gate. When muted, the voice button is a no-op and any
  // in-flight listen is aborted. Deliberately not persisted to settings — this
  // is an immediate-action control, not a preference.
  const [micMuted, setMicMuted] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const assistantMsgIdRef = useRef<string | null>(null);
  const pipelineRef = useRef<VoicePipeline | null>(null);
  const llmFullTextRef = useRef('');
  const llmResponderRef = useRef<LlmResponder | null>(null);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  // The pipeline is rebuilt whenever the chat mode changes, because the
  // responder (LLM vs Bergamot translator) is chosen once at construction.
  // Translation direction changes (source/target lang) also rebuild — the
  // translator service keeps only one loaded model and needs a fresh load.
  useEffect(() => {
    // Kick off the on-demand responder download/load for this mode. This is
    // also done by the mode picker; calling it again here is a no-op when
    // the model is already loaded and covers the path of opening an existing
    // chat after an app restart.
    void ensureResponder(mode, { sourceLang, targetLang });

    const recorder = Platform.createAudioRecorder({
      onStateChange: () => {},
      onAmplitude: (db) => setAmplitude(db),
    });
    const audioPlayer = Platform.createAudioPlayer();

    const tts = settings.ttsEngine === 'system' ? SystemTtsService : TtsService;
    const responder: IResponder =
      mode === 'translation'
        ? new TranslationResponder(TranslatorService)
        : (() => {
            const r = new LlmResponder(LlmService, {
              systemPrompt: settings.llmSystemPrompt,
            });
            llmResponderRef.current = r;
            return r;
          })();

    const pipeline = new VoicePipeline(
      {
        services: { stt: SttService, responder, tts },
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
        onLlmToken: (token) => {
          if (assistantMsgIdRef.current) {
            llmFullTextRef.current += token;
            appendAssistantToken(assistantMsgIdRef.current, token);
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
        ttsBufferMode: settings.ttsBufferMode,
        ttsOptions: {
          speed: activeConversation?.ttsSpeed ?? settings.ttsSpeed,
          pitch: settings.ttsPitch,
          language: settings.ttsSystemLanguage,
        },
        handsFreeMode: settings.handsFreeMode,
      },
    );

    pipelineRef.current = pipeline;
    return () => {
      void pipeline.stopListening();
      llmResponderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sourceLang, targetLang]);

  // Propagate live setting / active-conversation overrides to the long-lived
  // pipeline. The system prompt lives on the LLM responder now, so it is
  // updated separately — translation chats ignore this path entirely.
  useEffect(() => {
    pipelineRef.current?.updateConfig({
      ttsBufferMode: settings.ttsBufferMode,
      ttsOptions: {
        speed: activeConversation?.ttsSpeed ?? settings.ttsSpeed,
        pitch: settings.ttsPitch,
        language: settings.ttsSystemLanguage,
      },
      handsFreeMode: settings.handsFreeMode,
    });
    llmResponderRef.current?.updateConfig({
      systemPrompt: settings.llmSystemPrompt,
    });
  }, [
    activeConversation?.ttsSpeed,
    settings.llmSystemPrompt,
    settings.ttsBufferMode,
    settings.ttsSpeed,
    settings.ttsPitch,
    settings.ttsSystemLanguage,
    settings.handsFreeMode,
  ]);

  const handleVoicePress = useCallback(() => {
    const p = pipelineRef.current;
    if (!p) return;
    if (micMuted && phase === 'IDLE') return;
    if (phase === 'LISTENING') void p.stopListening();
    else if (phase === 'IDLE') void p.startListening();
    else if (phase === 'SPEAKING') void p.interrupt();
  }, [phase, micMuted]);

  const handleMicToggle = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      if (next) {
        // Muting: kill any in-flight listen immediately so the mic indicator
        // and LED turn off right away, even if VAD was mid-recording.
        void pipelineRef.current?.stopListening();
      }
      return next;
    });
  }, []);

  const handleRetry = useCallback(() => {
    setPipelineError(null);
    const p = pipelineRef.current;
    if (p && phase === 'IDLE') void p.startListening();
  }, [phase]);

  const handleNewConversation = useCallback(() => {
    void pipelineRef.current?.stopListening();
    pipelineRef.current?.clearHistory();
    router.push('/mode-picker');
  }, [router]);

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

  const handleControlsLayout = useCallback((e: LayoutChangeEvent) => {
    setControlsHeight(e.nativeEvent.layout.height);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

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
            onPress={() => { setMenuVisible(false); handleNewConversation(); }}
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
        // Android handles keyboard via android:windowSoftInputMode=adjustResize
        // in the manifest. Using KeyboardAvoidingView with behavior='height'
        // on top of that fights the native layout and causes the bottom
        // controls bar to jitter / grow as the list fills. Leaving behavior
        // undefined on Android means the native resize takes effect unopposed.
        behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}
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
            setAtBottom(distanceFromBottom < AppTheme.layout.atBottomThresholdPx);
          }}
          scrollEventThrottle={64}
        />

        {!atBottom && messages.length > 0 && controlsHeight > 0 ? (
          <IconButton
            icon="chevron-double-down"
            mode="contained"
            size={20}
            style={[
              styles.scrollToBottom,
              { bottom: controlsHeight + AppTheme.spacing.sm },
            ]}
            accessibilityLabel="Scroll to latest"
            onPress={handleScrollToBottom}
          />
        ) : null}

        <View
          onLayout={handleControlsLayout}
          style={[
            styles.controls,
            { paddingBottom: AppTheme.spacing.sm + insets.bottom },
          ]}
        >
          {inputMode === 'voice' ? (
            <View style={styles.voiceRow}>
              <IconButton
                icon={micMuted ? 'microphone-off' : 'microphone'}
                mode="contained-tonal"
                size={24}
                onPress={handleMicToggle}
                accessibilityLabel={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                accessibilityState={{ selected: micMuted }}
                style={styles.micToggle}
              />
              <VoiceButton phase={phase} amplitude={amplitude} onPress={handleVoicePress} />
              {/* Spacer to keep the VoiceButton centered even with the toggle on the left. */}
              <View style={styles.micToggleSpacer} pointerEvents="none" />
            </View>
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
    backgroundColor: AppTheme.colors.surfaceVariant,
    zIndex: 2,
    elevation: 4,
  },
  controls: {
    paddingTop: AppTheme.spacing.md,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppTheme.colors.surfaceVariant,
    backgroundColor: AppTheme.colors.background,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppTheme.spacing.lg,
  },
  micToggle: {
    marginBottom: 0,
  },
  micToggleSpacer: {
    width: 40,
  },
});
