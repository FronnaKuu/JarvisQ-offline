// ─── Setup Screen ─────────────────────────────────────────────────────────────
// Downloads all required models before allowing the user into the conversation.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { DownloadProgressItem } from '@ui/components/DownloadProgress';
import { downloadModelFiles, downloadModelDir } from '@core/models/ModelDownloader';
import type { DownloadProgress } from '@domain/types';
import {
  STT_MODELS,
  LLM_MODELS,
  TTS_MODELS,
  DEFAULT_STT_MODEL_ID,
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_TTS_MODEL_ID,
} from '@core/config/ModelConfig';
import { useConversationStore } from '@domain/ConversationStore';
import { QvacBridge } from '@core/audio/QvacBridge';
import { useSettingsStore } from '@domain/SettingsStore';
import { getModelPath, getModelDirPath } from '@core/models/ModelStorage';

type DownloadPhase = 'idle' | 'downloading' | 'loading' | 'done' | 'error';

export default function SetupScreen() {
  const router = useRouter();
  const createConversation = useConversationStore((s) => s.createConversation);
  const settings = useSettingsStore((s) => s.settings);

  const [phase, setPhase] = useState<DownloadPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sttProgress, setSttProgress] = useState<DownloadProgress | null>(null);
  const [llmProgress, setLlmProgress] = useState<DownloadProgress | null>(null);
  const [ttsProgress, setTtsProgress] = useState<DownloadProgress | null>(null);
  const [sttDone, setSttDone] = useState(false);
  const [llmDone, setLlmDone] = useState(false);
  const [ttsDone, setTtsDone] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  const startSetup = useCallback(async () => {
    setPhase('downloading');
    setError(null);
    try {
      // ── 1. Download STT model ───────────────────────────────────────────────
      const sttConfig = STT_MODELS[DEFAULT_STT_MODEL_ID]!;
      const sttTasks = [
        ...sttConfig.files.map((f) => ({
          filename: f.name,
          url: f.url,
          expectedSizeBytes: f.sizeBytes,
        })),
        {
          filename: sttConfig.vadFile.name,
          url: sttConfig.vadFile.url,
          expectedSizeBytes: sttConfig.vadFile.sizeBytes,
        },
      ];
      await downloadModelFiles(sttTasks, (p) => {
        if (isMounted.current) setSttProgress(p);
      });
      if (isMounted.current) setSttDone(true);

      // ── 2. Download LLM model ───────────────────────────────────────────────
      const llmConfig = LLM_MODELS[DEFAULT_LLM_MODEL_ID]!;
      await downloadModelFiles(
        [{ filename: llmConfig.file.name, url: llmConfig.file.url, expectedSizeBytes: llmConfig.file.sizeBytes }],
        (p) => { if (isMounted.current) setLlmProgress(p); },
      );
      if (isMounted.current) setLlmDone(true);

      // ── 3. Download TTS model ───────────────────────────────────────────────
      const ttsConfig = TTS_MODELS[DEFAULT_TTS_MODEL_ID]!;
      await downloadModelDir(
        ttsConfig.modelDir,
        ttsConfig.files.map((f) => ({
          filename: f.name,
          url: f.url,
          expectedSizeBytes: f.sizeBytes,
        })),
        (p) => { if (isMounted.current) setTtsProgress(p); },
      );
      if (isMounted.current) setTtsDone(true);

      // ── 4. Load models into worklet ─────────────────────────────────────────
      setPhase('loading');
      const cacheDir = getModelPath('');

      setLoadingStatus('Loading STT model…');
      await QvacBridge.sttLoad({
        modelPath: getModelPath(sttConfig.files[0]!.name),
        vadModelPath: getModelPath(sttConfig.vadFile.name),
        cacheDir,
        language: settings.sttLanguage,
        useGpu: settings.useGpu,
      });

      setLoadingStatus('Loading LLM model…');
      await QvacBridge.llmLoad({
        modelPath: getModelPath(llmConfig.file.name),
        cacheDir,
        useGpu: settings.useGpu,
        temperature: settings.llmTemperature,
        maxTokens: settings.llmMaxTokens,
      });

      setLoadingStatus('Loading TTS model…');
      await QvacBridge.ttsLoad({
        modelDir: getModelDirPath(ttsConfig.modelDir),
        cacheDir,
        voiceName: settings.ttsVoice,
        speed: settings.ttsSpeed,
        language: 'en',
        useGpu: settings.useGpu,
      });

      // ── 5. Create first conversation and navigate ───────────────────────────
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
            label={`STT: ${STT_MODELS[DEFAULT_STT_MODEL_ID]?.label ?? ''}`}
            progress={sttProgress}
            isDone={sttDone}
          />
          <DownloadProgressItem
            label={`LLM: ${LLM_MODELS[DEFAULT_LLM_MODEL_ID]?.label ?? ''}`}
            progress={llmProgress}
            isDone={llmDone}
          />
          <DownloadProgressItem
            label={`TTS: ${TTS_MODELS[DEFAULT_TTS_MODEL_ID]?.label ?? ''}`}
            progress={ttsProgress}
            isDone={ttsDone}
          />
        </View>

        {phase === 'loading' && (
          <Text variant="bodySmall" style={styles.loadingText}>
            {loadingStatus}
          </Text>
        )}

        {error && (
          <Text variant="bodySmall" style={styles.errorText}>
            {error}
          </Text>
        )}

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
  safe: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  content: {
    padding: 24,
    gap: 16,
    flexGrow: 1,
  },
  title: {
    color: '#E4E1E6',
    marginTop: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#908F9A',
    marginBottom: 16,
  },
  section: {
    backgroundColor: '#121218',
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  loadingText: {
    color: '#BDC2DD',
    textAlign: 'center',
  },
  errorText: {
    color: '#FFB4AB',
    textAlign: 'center',
  },
  button: {
    marginTop: 24,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
