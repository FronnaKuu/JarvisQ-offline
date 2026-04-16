// ---- Settings Screen -----------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Divider, Switch, Text, TextInput } from 'react-native-paper';
import { useSettingsStore } from '@domain/SettingsStore';
import { NumericSettingRow } from '@ui/components/settings/NumericSettingRow';
import { AppTheme } from '@ui/theme/theme';
import type { AppSettings } from '@domain/types';

const SYSTEM_PROMPT_DEBOUNCE_MS = 600;

export default function SettingsScreen() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [systemPrompt, setSystemPrompt] = useState(settings.llmSystemPrompt);
  const [sttLanguage, setSttLanguage] = useState(settings.sttLanguage);
  const [ttsVoice, setTtsVoice] = useState(settings.ttsVoice);
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
        <TextInput
          label="Voice"
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
        <NumericSettingRow
          label="Speech speed"
          value={settings.ttsSpeed}
          min={0.5}
          max={2}
          helper="Playback rate multiplier."
          onCommit={(v) => void updateSettings({ ttsSpeed: v })}
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
          JarvisQVAC -- on-device AI voice assistant{'\n'}
          STT: Whisper / Parakeet (qvac){'\n'}
          LLM: llama.cpp (qvac){'\n'}
          TTS: Supertonic ONNX (qvac){'\n'}
          Backend: QVAC by Tether.to
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
  about: {
    color: AppTheme.colors.outline,
    lineHeight: 20,
  },
});
