// ─── Settings Screen ──────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { Divider, Switch, Text, TextInput } from 'react-native-paper';
import { useSettingsStore } from '@domain/SettingsStore';

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
          outlineColor="#1A1A24"
          activeOutlineColor="#7B9EFF"
          textColor="#E4E1E6"
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
            color="#7B9EFF"
          />
        </View>

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.sectionTitle}>
          About
        </Text>
        <Text variant="bodySmall" style={styles.about}>
          JarvisQVAC — on-device AI voice assistant{'\n'}
          STT: Whisper (qvac-lib-infer-whispercpp){'\n'}
          LLM: llama.cpp (qvac-lib-infer-llamacpp-llm){'\n'}
          TTS: Supertonic ONNX (qvac-lib-infer-onnx-tts){'\n'}
          Backend: QVAC by Tether.to
        </Text>
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
    gap: 12,
  },
  sectionTitle: {
    color: '#7B9EFF',
    marginTop: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#121218',
  },
  divider: {
    backgroundColor: '#1A1A24',
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: {
    color: '#E4E1E6',
  },
  about: {
    color: '#908F9A',
    lineHeight: 20,
  },
});
