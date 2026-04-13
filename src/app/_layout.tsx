// ─── Root Layout ──────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { AppTheme } from '@ui/theme/theme';
import { QvacBridge } from '@core/audio/QvacBridge';
import { useSettingsStore } from '@domain/SettingsStore';
import { useConversationStore } from '@domain/ConversationStore';

export default function RootLayout() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadConversations = useConversationStore((s) => s.loadConversations);

  useEffect(() => {
    // Start the Bare worklet as early as possible
    QvacBridge.start();
    // Load persisted state
    void loadSettings();
    void loadConversations();
  }, [loadSettings, loadConversations]);

  return (
    <PaperProvider theme={AppTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0B0B0F' },
          headerTintColor: '#E4E1E6',
          contentStyle: { backgroundColor: '#0B0B0F' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ title: 'Setup', headerShown: false }} />
        <Stack.Screen name="conversation" options={{ title: 'Conversation', headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </PaperProvider>
  );
}
