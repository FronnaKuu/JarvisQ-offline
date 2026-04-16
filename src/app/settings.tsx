// ---- Settings Screen -----------------------------------------------------

import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { Divider, Switch, Text, TextInput } from 'react-native-paper';
import { useSettingsStore } from '@domain/SettingsStore';
import { AppTheme } from '@ui/theme/theme';

export default function SettingsScreen() {
  const { settings, updateSettings } = useSettingsStore();

  const [systemPrompt, setSystemPrompt] = useState(settings.llmSystemPrompt);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>

        <Text variant="titleMedium" style={styles.sectionTitle}>
          Language Model
        </Text>
        <TextInput
          label="System Prompt"
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          onBlur={() => void updateSettings({ llmSystemPrompt: systemPrompt })}
          multiline
          numberOfLines={4}
          style={styles.input}
          mode="outlined"
          outlineColor={AppTheme.colors.surfaceVariant}
          activeOutlineColor={AppTheme.colors.primary}
          textColor={AppTheme.colors.onBackground}
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
    padding: 24,
    gap: 12,
  },
  sectionTitle: {
    color: AppTheme.colors.primary,
    marginTop: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: AppTheme.colors.surface,
  },
  divider: {
    backgroundColor: AppTheme.colors.surfaceVariant,
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: {
    color: AppTheme.colors.onBackground,
  },
  about: {
    color: AppTheme.colors.outline,
    lineHeight: 20,
  },
});
