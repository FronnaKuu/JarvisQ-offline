// ---- Conversation Screen -------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { DictationBubble } from '@ui/components/DictationBubble';
import { VoiceButton } from '@ui/components/VoiceButton';
import { TextComposer } from '@ui/components/TextComposer';
import { ModelLoadingOverlay } from '@ui/components/ModelLoadingOverlay';
import { VoicePipeline } from '@core/pipeline/VoicePipeline';
import { LlmResponder } from '@core/pipeline/LlmResponder';
import { TranslationResponder } from '@core/pipeline/TranslationResponder';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TranslatorService } from '@core/inference/TranslatorService';
import { TtsService } from '@core/inference/TtsService';
import { SystemTtsService } from '@platform/mobile/SystemTtsService';
import { Platform } from '@platform/mobile/Platform';
import { AppConfig } from '@core/config/AppConfig';
import { useConversationStore } from '@domain/ConversationStore';
import { useBootstrapStore } from '@domain/BootstrapStore';
import { useSettingsStore } from '@domain/SettingsStore';
import { AppTheme } from '@ui/theme/theme';
import type { IResponder } from '@core/inference/types';
import type { DictationView, Message, PipelinePhase } from '@domain/types';

const EMPTY_DICTATION: DictationView = { committedText: '', runningPartial: '' };

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
  const ensureTts = useBootstrapStore((s) => s.ensureTts);
  const llmServiceStatus = useBootstrapStore((s) => s.services.llm);
  const translatorServiceStatus = useBootstrapStore((s) => s.services.translator);
  const settings = useSettingsStore((s) => s.settings);
  const mode = activeConversation?.mode ?? 'conversation';
  const sourceLang = activeConversation?.sourceLang ?? null;
  const targetLang = activeConversation?.targetLang ?? null;

  const [phase, setPhase] = useState<PipelinePhase>('IDLE');
  const [dictation, setDictation] = useState<DictationView>(EMPTY_DICTATION);
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
    // Switching TTS engine in Settings after boot requires loading the new
    // engine's model — boot only loads whichever engine was selected at
    // startup. ensureTts is idempotent (no-op when already loaded or 'system').
    void ensureTts();

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
        liveRecorder: Platform.createLiveRecorder(),
      },
      {
        onPhaseChange: (p) => {
          setPhase(p);
        },
        onAmplitude: (db) => setAmplitude(db),
        onTranscriptionPartial: (text) =>
          setDictation({ committedText: text, runningPartial: '' }),
        onDictationCommitted: (text) =>
          setDictation({ committedText: text, runningPartial: '' }),
        onDictationRunningPartial: (text) =>
          setDictation((prev) => ({ ...prev, runningPartial: text })),
        onSttFinal: async (text) => {
          setDictation(EMPTY_DICTATION);
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
          setDictation(EMPTY_DICTATION);
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
        // handsFreeMode is driven per-session by the voice button below,
        // not by settings — starting a voice session enables auto-rearm,
        // explicit stop or hard-mute disables it.
        handsFreeMode: false,
        // Dictation mode routes LISTEN through the parakeet addon's live
        // Silero-VAD streaming path. Gated on the same flag that wires
        // vadModelSrc into the model config — off for whisper and any
        // parakeet build where the new .bare isn't deployed.
        dictationMode: AppConfig.stt.parakeetStreamingEnabled,
        dictationAutoCommitMs: settings.dictationAutoCommitMs,
      },
    );

    pipelineRef.current = pipeline;
    return () => {
      void pipeline.stopListening();
      llmResponderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sourceLang, targetLang, settings.ttsEngine]);

  // Propagate live setting / active-conversation overrides to the long-lived
  // pipeline. The system prompt lives on the LLM responder now, so it is
  // updated separately — translation chats ignore this path entirely.
  // handsFreeMode is intentionally excluded: it is owned by the voice-button
  // interaction (start = auto-rearm, stop/mute = one-shot) so settings cannot
  // overwrite a live session here.
  useEffect(() => {
    pipelineRef.current?.updateConfig({
      ttsBufferMode: settings.ttsBufferMode,
      ttsOptions: {
        speed: activeConversation?.ttsSpeed ?? settings.ttsSpeed,
        pitch: settings.ttsPitch,
        language: settings.ttsSystemLanguage,
      },
      dictationAutoCommitMs: settings.dictationAutoCommitMs,
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
    settings.dictationAutoCommitMs,
  ]);

  const handleVoicePress = useCallback(() => {
    const p = pipelineRef.current;
    if (!p) return;
    if (micMuted && phase === 'IDLE') return;
    if (phase === 'LISTENING') {
      // Explicit stop ends the hands-free session: no auto-rearm after.
      p.updateConfig({ handsFreeMode: false });
      // Dictation mode: tap-to-stop is a graceful "submit" — the live
      // recorder is closed, the SDK streaming session drains, and the
      // accumulated transcript proceeds to the LLM turn. Other modes treat
      // an explicit stop as a hard cancel (no transcription consumed).
      if (AppConfig.stt.parakeetStreamingEnabled) {
        void p.commitListening();
      } else {
        void p.stopListening();
      }
    } else if (phase === 'IDLE') {
      // Starting from IDLE enters a hands-free session — the mic will
      // reopen automatically after each turn (VAD-gated, so ambient noise
      // does not trigger a new turn) until the user explicitly stops or
      // hard-mutes.
      p.updateConfig({ handsFreeMode: true });
      void p.startListening();
    } else if (phase === 'SPEAKING') {
      void p.interrupt();
    }
  }, [phase, micMuted]);

  const handleMicToggle = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      if (next) {
        // Hard-mute: cancel any in-flight listen and kill the hands-free
        // session so the pipeline does not auto-rearm while muted.
        pipelineRef.current?.updateConfig({ handsFreeMode: false });
        void pipelineRef.current?.stopListening();
        setDictation(EMPTY_DICTATION);
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
    setDictation(EMPTY_DICTATION);
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

  const hasDictation =
    dictation.committedText.length > 0 || dictation.runningPartial.length > 0;

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
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          contentContainerStyle={[
            styles.chatContent,
            messages.length === 0 && !hasDictation && styles.chatContentEmpty,
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
          ListFooterComponent={
            hasDictation ? <DictationBubble view={dictation} /> : null
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

      <ModelLoadingOverlay
        visible={(mode === 'translation' ? translatorServiceStatus : llmServiceStatus).phase === 'active'}
        label={(mode === 'translation' ? translatorServiceStatus : llmServiceStatus).label}
      />

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
