// ---- Splash / Bootstrap Screen -------------------------------------------
// Entry route: requests microphone permission, ensures all inference models
// are loaded (from cache or via download), then redirects to the conversation
// screen. Replaces the previous hard split between /setup and /conversation
// so returning users never see a "Download & Setup" button when the cache is
// already warm.

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { DownloadProgressItem } from '@ui/components/DownloadProgress';
import { useBootstrapStore } from '@domain/BootstrapStore';
import { useSettingsStore } from '@domain/SettingsStore';
import { useConversationStore } from '@domain/ConversationStore';
import { getPlatform } from '@core/platform/PlatformContainer';
import { AppTheme } from '@ui/theme/theme';
import type { ServiceKind } from '@core/bootstrap/AppBootstrap';
import type { DownloadProgress } from '@domain/types';

const SERVICE_ORDER: ServiceKind[] = ['stt', 'llm', 'tts'];

function toDownloadProgress(
  service: { progress: { bytesDownloaded: number; totalBytes: number; percentage: number } | null; label: string },
): DownloadProgress | null {
  if (!service.progress) return null;
  return {
    bytesDownloaded: service.progress.bytesDownloaded,
    totalBytes: service.progress.totalBytes,
    percentage: service.progress.percentage,
    currentFile: service.label,
  };
}

export default function Index() {
  const router = useRouter();
  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const conversationsLoaded = useConversationStore((s) => s.isLoaded);
  const phase = useBootstrapStore((s) => s.phase);
  const errorMessage = useBootstrapStore((s) => s.errorMessage);
  const services = useBootstrapStore((s) => s.services);
  const start = useBootstrapStore((s) => s.start);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!settingsLoaded || !conversationsLoaded) return;
    if (phase !== 'idle') return;
    void (async () => {
      const platform = getPlatform();
      const online = await platform.networkInfo.isOnline();
      setIsOffline(!online);

      const permissionStatus = await platform.permissions.getMicrophoneStatus();
      if (permissionStatus !== 'granted') {
        await platform.permissions.requestMicrophone();
      }
      await start();
    })();
  }, [settingsLoaded, conversationsLoaded, phase, start]);

  useEffect(() => {
    if (phase === 'ready') {
      router.replace('/conversation');
    }
  }, [phase, router]);

  if (!settingsLoaded || !conversationsLoaded || phase === 'idle') {
    return <SafeAreaView style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text variant="displaySmall" style={styles.title}>
          JarvisQVAC
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          {isOffline ? 'Offline — loading cached models' : 'Preparing on-device models'}
        </Text>

        <View style={styles.section}>
          {SERVICE_ORDER.map((kind) => {
            const service = services[kind];
            return (
              <DownloadProgressItem
                key={kind}
                label={service.label || kind.toUpperCase()}
                progress={toDownloadProgress(service)}
                isDone={service.phase === 'done'}
                phase={service.phase}
              />
            );
          })}
        </View>

        {phase === 'error' && errorMessage ? (
          <>
            <Text variant="bodySmall" style={styles.errorText}>
              {errorMessage}
            </Text>
            <Button
              mode="contained"
              onPress={() => void start()}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              Retry
            </Button>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppTheme.colors.background },
  content: {
    flex: 1,
    paddingHorizontal: AppTheme.spacing.xl,
    justifyContent: 'center',
    gap: AppTheme.spacing.xl,
  },
  title: {
    color: AppTheme.colors.onBackground,
    fontWeight: '700',
    textAlign: 'center',
  },
  section: {
    gap: AppTheme.spacing.md,
  },
  errorText: { color: AppTheme.colors.error, textAlign: 'center' },
  subtitle: {
    color: AppTheme.colors.outline,
    textAlign: 'center',
    marginTop: -AppTheme.spacing.md,
  },
  button: {
    marginTop: AppTheme.spacing.lg,
    borderRadius: AppTheme.radius.lg,
  },
  buttonContent: { paddingVertical: AppTheme.spacing.sm },
});
