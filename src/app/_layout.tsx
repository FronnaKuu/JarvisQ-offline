// ---- Root Layout ---------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { AppTheme } from '@ui/theme/theme';
import { useSettingsStore } from '@domain/SettingsStore';
import { useConversationStore } from '@domain/ConversationStore';
import { bootstrapMobile } from '@platform/mobile/bootstrap';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadConversations = useConversationStore((s) => s.loadConversations);

  useEffect(() => {
    (async () => {
      await bootstrapMobile();
      await Promise.all([loadSettings(), loadConversations()]);
      setReady(true);
    })();
  }, [loadSettings, loadConversations]);

  if (!ready) return null;

  return (
    <PaperProvider theme={AppTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: AppTheme.colors.background },
          headerTintColor: AppTheme.colors.onBackground,
          contentStyle: { backgroundColor: AppTheme.colors.background },
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
