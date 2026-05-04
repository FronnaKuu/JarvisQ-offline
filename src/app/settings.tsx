// ---- Settings Screen -----------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Divider, SegmentedButtons, Switch, Text, TextInput } from 'react-native-paper';
import { useSettingsStore } from '@domain/SettingsStore';
import { NumericSettingRow } from '@ui/components/settings/NumericSettingRow';
import { AppConfig } from '@core/config/AppConfig';
import { AppTheme } from '@ui/theme/theme';
import type { AppSettings, TtsBufferMode, TtsEngineId } from '@domain/types';

const SYSTEM_PROMPT_DEBOUNCE_MS = 600;

export default function SettingsScreen() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [systemPrompt, setSystemPrompt] = useState(settings.llmSystemPrompt);
  const [sttLanguage, setSttLanguage] = useState(settings.sttLanguage);
  const [ttsVoice, setTtsVoice] = useState(settings.ttsVoice);
  const [ttsSystemLanguage, setTtsSystemLanguage] = useState(settings.ttsSystemLanguage);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const scheduleUpdate = (fields: Partial<AppSettings>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void updateSettings(fields);
    }, SYSTEM_PROMPT_DEBOUNCE_MS);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Language Model
        </Text>
        <TextInput
          label="System Prompt"
          value={systemPrompt}
          onChangeText={(text) => {
            setSystemPrompt(text);
            scheduleUpdate({ llmSystemPrompt: text });
          }}
          multiline
          numberOfLines={4}
          style={styles.input}
          mode="outlined"
          outlineColor={AppTheme.colors.surfaceVariant}
          activeOutlineColor={AppTheme.colors.primary}
          textColor={AppTheme.colors.onBackground}
        />
        <NumericSettingRow
          label="Temperature"
          value={settings.llmTemperature}
          min={0}
          max={2}
          helper="Creativity: 0 = deterministic, 2 = chaotic. Typical 0.6–0.9."
          onCommit={(v) => void updateSettings({ llmTemperature: v })}
        />
        <NumericSettingRow
          label="Max response tokens"
          value={settings.llmMaxTokens}
          min={16}
          max={2048}
          helper="Upper bound on assistant reply length."
          onCommit={(v) => void updateSettings({ llmMaxTokens: v })}
        />

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.sectionTitle}>
          Speech-to-text
        </Text>
        <TextInput
          label="STT language (ISO code)"
          value={sttLanguage}
          onChangeText={(text) => {
            setSttLanguage(text);
            scheduleUpdate({ sttLanguage: text });
          }}
          mode="outlined"
          outlineColor={AppTheme.colors.surfaceVariant}
          activeOutlineColor={AppTheme.colors.primary}
          textColor={AppTheme.colors.onBackground}
          autoCapitalize="none"
          style={styles.input}
        />

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.sectionTitle}>
          Text-to-speech
        </Text>

        <Text variant="bodySmall" style={styles.subLabel}>
          Engine
        </Text>
        <SegmentedButtons
          value={settings.ttsEngine}
          onValueChange={(v) => void updateSettings({ ttsEngine: v as TtsEngineId })}
          buttons={[
            { value: 'supertonic', label: 'Supertonic' },
            { value: 'system', label: 'System (Google)' },
          ]}
          style={styles.segmented}
        />
        <Text variant="bodySmall" style={styles.helper}>
          Supertonic: on-device ONNX, English only. System: uses the
          Android/iOS native engine (Google TTS, Samsung, etc.) with any
          language installed on the device. Runs on a separate native thread,
          so it never stalls the LLM token stream.
        </Text>

        <Text variant="bodySmall" style={styles.subLabel}>
          Synthesis timing
        </Text>
        <SegmentedButtons
          value={settings.ttsBufferMode}
          onValueChange={(v) => void updateSettings({ ttsBufferMode: v as TtsBufferMode })}
          buttons={[
            { value: 'streaming', label: 'Streaming' },
            { value: 'buffered', label: 'After reply' },
          ]}
          style={styles.segmented}
        />
        <Text variant="bodySmall" style={styles.helper}>
          Streaming speaks each clause while the LLM is still generating.
          "After reply" waits until the full response is ready — slower to
          start, but avoids mid-sentence slowdowns on weaker devices.
        </Text>

        {settings.ttsEngine === 'supertonic' ? (
          <TextInput
            label="Voice (Supertonic)"
            value={ttsVoice}
            onChangeText={(text) => {
              setTtsVoice(text);
              scheduleUpdate({ ttsVoice: text });
            }}
            mode="outlined"
            outlineColor={AppTheme.colors.surfaceVariant}
            activeOutlineColor={AppTheme.colors.primary}
            textColor={AppTheme.colors.onBackground}
            style={styles.input}
          />
        ) : (
          <>
            <Text variant="bodySmall" style={styles.helper}>
              The system engine uses the TTS engine, voice and language
              configured in Android settings. Tap the button below to pick
              them: any language and voice installed on the device will work
              (Google TTS, Samsung, etc.).
            </Text>
            <Button
              mode="contained-tonal"
              icon="cog"
              onPress={() => {
                if (Platform.OS === 'android') {
                  Linking.sendIntent('com.android.settings.TTS_SETTINGS').catch(
                    () => {
                      // Some OEMs hide the intent; fall back to general settings.
                      void Linking.openSettings();
                    },
                  );
                } else {
                  void Linking.openSettings();
                }
              }}
              style={styles.input}
            >
              Open system TTS settings
            </Button>
            <TextInput
              label="Override language (optional, BCP-47)"
              value={ttsSystemLanguage}
              onChangeText={(text) => {
                setTtsSystemLanguage(text);
                scheduleUpdate({ ttsSystemLanguage: text });
              }}
              mode="outlined"
              placeholder="Leave empty to follow device default"
              outlineColor={AppTheme.colors.surfaceVariant}
              activeOutlineColor={AppTheme.colors.primary}
              textColor={AppTheme.colors.onBackground}
              autoCapitalize="none"
              style={styles.input}
            />
          </>
        )}

        <NumericSettingRow
          label="Speech speed"
          value={settings.ttsSpeed}
          min={0.5}
          max={2}
          helper="Playback rate multiplier."
          onCommit={(v) => void updateSettings({ ttsSpeed: v })}
        />
        <NumericSettingRow
          label="Pitch"
          value={settings.ttsPitch}
          min={0.5}
          max={2}
          helper="Voice pitch multiplier. Honored by the system engine; Supertonic ignores it."
          onCommit={(v) => void updateSettings({ ttsPitch: v })}
        />

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.sectionTitle}>
          Voice
        </Text>
        <View style={styles.row}>
          <View style={styles.rowLabelColumn}>
            <Text variant="bodyMedium" style={styles.rowLabel}>
              Hands-free mode
            </Text>
            <Text variant="bodySmall" style={styles.rowHelper}>
              Re-open the microphone automatically after the assistant speaks.
              Disable on devices without echo cancellation to avoid self-triggered turns.
            </Text>
          </View>
          <Switch
            value={settings.handsFreeMode}
            onValueChange={(v) => void updateSettings({ handsFreeMode: v })}
            color={AppTheme.colors.primary}
          />
        </View>
        <NumericSettingRow
          label="Auto-commit silence (ms)"
          value={
            settings.dictationAutoCommitMs ??
            AppConfig.stt.dictationAutoCommitMs
          }
          min={AppConfig.stt.endOfTurnRange.minMs}
          max={AppConfig.stt.endOfTurnRange.maxMs}
          step={AppConfig.stt.endOfTurnRange.stepMs}
          helper="Silence after the last spoken segment before the assistant takes its turn. Raise it if the LLM starts replying while you are still pausing mid-sentence."
          onCommit={(v) => void updateSettings({ dictationAutoCommitMs: v })}
        />

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.sectionTitle}>
          Hardware
        </Text>
        <View style={styles.row}>
          <Text variant="bodyMedium" style={styles.rowLabel}>
            Use GPU acceleration
          </Text>
          <Switch
            value={settings.useGpu}
            onValueChange={(v) => void updateSettings({ useGpu: v })}
            color={AppTheme.colors.primary}
          />
        </View>

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.sectionTitle}>
          About
        </Text>
        <Text variant="bodySmall" style={styles.about}>
          JarvisQ -- on-device AI voice assistant{'\n'}
          STT: Whisper / Parakeet (QVAC SDK){'\n'}
          LLM: llama.cpp (QVAC SDK){'\n'}
          TTS: Supertonic ONNX (QVAC SDK){'\n'}
          Backend: Tether QVAC SDK (independent project)
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: AppTheme.colors.background,
  },
  content: {
    padding: AppTheme.spacing.xl,
    gap: AppTheme.spacing.md,
  },
  sectionTitle: {
    color: AppTheme.colors.primary,
    marginTop: AppTheme.spacing.sm,
    fontWeight: '600',
  },
  input: {
    backgroundColor: AppTheme.colors.surface,
  },
  divider: {
    backgroundColor: AppTheme.colors.surfaceVariant,
    marginVertical: AppTheme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: AppTheme.spacing.sm,
  },
  rowLabel: {
    color: AppTheme.colors.onBackground,
  },
  rowLabelColumn: {
    flex: 1,
    paddingRight: AppTheme.spacing.md,
  },
  rowHelper: {
    color: AppTheme.colors.outline,
    marginTop: 2,
  },
  about: {
    color: AppTheme.colors.outline,
    lineHeight: 20,
  },
  subLabel: {
    color: AppTheme.colors.outline,
    marginTop: AppTheme.spacing.sm,
  },
  segmented: {
    marginVertical: AppTheme.spacing.xs,
  },
  helper: {
    color: AppTheme.colors.outline,
    marginBottom: AppTheme.spacing.sm,
  },
});
