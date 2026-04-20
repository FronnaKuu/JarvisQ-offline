// ---- Root Layout ---------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AppTheme } from '@ui/theme/theme';
import { useSettingsStore } from '@domain/SettingsStore';
import { useConversationStore } from '@domain/ConversationStore';
import { bootstrapMobile } from '@platform/mobile/bootstrap';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadConversations = useConversationStore((s) => s.loadConversations);

  useEffect(() => {
    (async () => {
      await bootstrapMobile();
      await Promise.all([loadSettings(), loadConversations()]);
      setReady(true);
      await SplashScreen.hideAsync().catch(() => {});
    })();
  }, [loadSettings, loadConversations]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
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
        <Stack.Screen name="conversations" options={{ title: 'Conversations', headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', headerShown: false }} />
      </Stack>
    </PaperProvider>
    </SafeAreaProvider>
  );
}
