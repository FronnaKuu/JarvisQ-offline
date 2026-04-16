// ─── Setup Screen ─────────────────────────────────────────────────────────────
// Downloads and loads all required models via @qvac/sdk before entering the app.
// The SDK handles download, caching, and loading in a single loadModel() call.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { DownloadProgressItem } from '@ui/components/DownloadProgress';
import {
  STT_PROFILES,
  LLM_PROFILES,
  TTS_PROFILES,
  DEFAULT_STT_PROFILE_ID,
  DEFAULT_LLM_PROFILE_ID,
  DEFAULT_TTS_PROFILE_ID,
} from '@core/config/ModelConfig';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';
import { useConversationStore } from '@domain/ConversationStore';
import { useSettingsStore } from '@domain/SettingsStore';
import type { DownloadProgress } from '@domain/types';
import type { ModelProgressUpdate } from '@qvac/sdk';

type SetupPhase = 'idle' | 'loading' | 'done' | 'error';

function sdkProgressToDownloadProgress(
  p: ModelProgressUpdate,
  label: string,
): DownloadProgress {
  return {
    bytesDownloaded: p.downloaded,
    totalBytes: p.total,
    percentage: p.percentage,
    currentFile: label,
  };
}

export default function SetupScreen() {
  const router = useRouter();
  const createConversation = useConversationStore((s) => s.createConversation);
  const settings = useSettingsStore((s) => s.settings);

  const [phase, setPhase] = useState<SetupPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sttProgress, setSttProgress] = useState<DownloadProgress | null>(null);
  const [llmProgress, setLlmProgress] = useState<DownloadProgress | null>(null);
  const [ttsProgress, setTtsProgress] = useState<DownloadProgress | null>(null);
  const [sttDone, setSttDone] = useState(false);
  const [llmDone, setLlmDone] = useState(false);
  const [ttsDone, setTtsDone] = useState(false);
  const [statusText, setStatusText] = useState('');

  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  const startSetup = useCallback(async () => {
    setPhase('loading');
    setError(null);

    try {
      const sttProfile = STT_PROFILES[DEFAULT_STT_PROFILE_ID]!;
      const llmProfile = LLM_PROFILES[DEFAULT_LLM_PROFILE_ID]!;
      const ttsProfile = TTS_PROFILES[DEFAULT_TTS_PROFILE_ID]!;

      // ── 1. Load STT ────────────────────────────────────────────────────────
      setStatusText(`Downloading ${sttProfile.label}…`);
      await SttService.load(
        sttProfile.buildLoadConfig(settings.useGpu, settings.sttLanguage),
        (p) => {
          if (isMounted.current) {
            setSttProgress(sdkProgressToDownloadProgress(p, sttProfile.label));
          }
        },
        sttProfile.buildHttpFallbackConfig?.(settings.useGpu, settings.sttLanguage),
      );
      if (isMounted.current) setSttDone(true);

      // ── 2. Load LLM ────────────────────────────────────────────────────────
      setStatusText(`Downloading ${llmProfile.label}…`);
      await LlmService.load(
        llmProfile.buildLoadConfig(
          settings.useGpu,
          settings.llmSystemPrompt,
          settings.llmTemperature,
          settings.llmMaxTokens,
        ),
        (p) => {
          if (isMounted.current) {
            setLlmProgress(sdkProgressToDownloadProgress(p, llmProfile.label));
          }
        },
        llmProfile.buildHttpFallbackConfig?.(
          settings.useGpu,
          settings.llmSystemPrompt,
          settings.llmTemperature,
          settings.llmMaxTokens,
        ),
      );
      if (isMounted.current) setLlmDone(true);

      // ── 3. Load TTS ────────────────────────────────────────────────────────
      setStatusText(`Downloading ${ttsProfile.label}…`);
      await TtsService.load(
        ttsProfile.buildLoadConfig(settings.useGpu, settings.ttsSpeed, 'en'),
        (p) => {
          if (isMounted.current) {
            setTtsProgress(sdkProgressToDownloadProgress(p, ttsProfile.label));
          }
        },
        ttsProfile.buildHttpFallbackConfig?.(settings.useGpu, settings.ttsSpeed, 'en'),
      );
      if (isMounted.current) setTtsDone(true);

      // ── 4. Create first conversation and navigate ──────────────────────────
      await createConversation();
      setPhase('done');
      router.replace('/conversation');
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    }
  }, [createConversation, router, settings]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="headlineMedium" style={styles.title}>
          JarvisQVAC
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          On-device AI voice assistant powered by QVAC
        </Text>

        <View style={styles.section}>
          <DownloadProgressItem
            label={STT_PROFILES[DEFAULT_STT_PROFILE_ID]?.label ?? 'STT Model'}
            progress={sttProgress}
            isDone={sttDone}
          />
          <DownloadProgressItem
            label={LLM_PROFILES[DEFAULT_LLM_PROFILE_ID]?.label ?? 'LLM Model'}
            progress={llmProgress}
            isDone={llmDone}
          />
          <DownloadProgressItem
            label={TTS_PROFILES[DEFAULT_TTS_PROFILE_ID]?.label ?? 'TTS Model'}
            progress={ttsProgress}
            isDone={ttsDone}
          />
        </View>

        {phase === 'loading' && statusText ? (
          <Text variant="bodySmall" style={styles.statusText}>
            {statusText}
          </Text>
        ) : null}

        {error ? (
          <Text variant="bodySmall" style={styles.errorText}>
            {error}
          </Text>
        ) : null}

        {phase === 'idle' && (
          <Button
            mode="contained"
            onPress={() => void startSetup()}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Download & Setup
          </Button>
        )}

        {phase === 'error' && (
          <Button
            mode="contained"
            onPress={() => void startSetup()}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Retry
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0B0F' },
  content: { padding: 24, gap: 16, flexGrow: 1 },
  title: { color: '#E4E1E6', marginTop: 32, fontWeight: '700' },
  subtitle: { color: '#908F9A', marginBottom: 16 },
  section: {
    backgroundColor: '#121218',
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  statusText: { color: '#BDC2DD', textAlign: 'center' },
  errorText: { color: '#FFB4AB', textAlign: 'center' },
  button: { marginTop: 24, borderRadius: 12 },
  buttonContent: { paddingVertical: 8 },
});
