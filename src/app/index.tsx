// ---- Splash / Bootstrap Screen -------------------------------------------
// Entry route: requests microphone permission, ensures the always-on
// inference services (STT + TTS) are loaded, then redirects to the chat or
// the mode picker.
//
// LLM and Bergamot translator are deliberately not loaded here — they are
// mutually exclusive on RAM and the active one is decided by the
// conversation mode, so they load lazily when the user enters a chat. The
// LLM row in this screen exposes that contract to the user instead of
// hiding it.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useBootstrapStore } from '@domain/BootstrapStore';
import { useSettingsStore } from '@domain/SettingsStore';
import { useConversationStore } from '@domain/ConversationStore';
import { getPlatform } from '@core/platform/PlatformContainer';
import { DownloadProgressItem } from '@ui/components/DownloadProgress';
import { AppTheme } from '@ui/theme/theme';
import type { ServiceStatus } from '@domain/BootstrapStore';
import type { DownloadProgress } from '@domain/types';

// Services downloaded and loaded at splash time, in call order. Bergamot is
// not in this list: its language pair is unknown until the user opens the
// mode picker, so it stays lazy. Conversation chats are zero-wait once the
// splash is done; translation chats see a brief overlay for Bergamot.
const BOOT_KINDS = ['stt', 'llm', 'tts'] as const;

function snapshotToDownloadProgress(
  status: ServiceStatus,
): DownloadProgress | null {
  if (!status.progress) return null;
  return {
    bytesDownloaded: status.progress.bytesDownloaded,
    totalBytes: status.progress.totalBytes,
    percentage: status.progress.percentage,
    currentFile: status.label,
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

  const hasConversations = useConversationStore(
    (s) => s.conversations.length > 0,
  );

  useEffect(() => {
    if (phase !== 'ready') return;
    // Existing users land on their last chat; first-run (empty list) routes
    // to the mode picker so the user chooses 'conversation' or 'translation'
    // before any responder model is downloaded.
    router.replace(hasConversations ? '/conversation' : '/mode-picker');
  }, [phase, hasConversations, router]);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (!settingsLoaded || !conversationsLoaded || phase === 'idle') {
    return <SafeAreaView style={styles.safe} />;
  }

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  const statusLabel =
    phase === 'error'
      ? 'Something went wrong'
      : isOffline
        ? 'Offline — loading cached models'
        : 'Preparing on-device models';

  const translatorStatus = services.translator;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.badge,
            { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
          ]}
        >
          <Text variant="displaySmall" style={styles.badgeText}>
            J
          </Text>
        </Animated.View>

        <View style={styles.titleBlock}>
          <Text variant="headlineSmall" style={styles.title}>
            JarvisQ
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {statusLabel}
          </Text>
        </View>

        {phase !== 'error' ? (
          <View style={styles.section}>
            {BOOT_KINDS.map((kind) => {
              const status = services[kind];
              return (
                <DownloadProgressItem
                  key={kind}
                  label={status.label || kind.toUpperCase()}
                  progress={snapshotToDownloadProgress(status)}
                  isDone={status.phase === 'done'}
                  phase={status.phase}
                />
              );
            })}
            <DeferredItem
              label={translatorStatus.label || 'Bergamot translator'}
              hint="Loads when you start a translation"
            />
          </View>
        ) : null}

        {phase === 'error' && errorMessage ? (
          <View style={styles.errorBlock}>
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
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

interface DeferredItemProps {
  label: string;
  hint: string;
}

// Renders the same row layout as DownloadProgressItem for visual parity but
// without a progress bar — used for services that load lazily downstream.
function DeferredItem({ label, hint }: DeferredItemProps) {
  return (
    <View style={styles.deferredItem}>
      <View style={styles.deferredRow}>
        <Text variant="bodyMedium" style={styles.deferredLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="bodySmall" style={styles.deferredHint}>
          {hint}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppTheme.colors.background },
  content: {
    flex: 1,
    paddingHorizontal: AppTheme.spacing.xxl,
    justifyContent: 'center',
    alignItems: 'center',
    gap: AppTheme.spacing.xl,
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: AppTheme.colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: AppTheme.colors.onPrimaryContainer,
    fontWeight: '700',
  },
  titleBlock: {
    alignItems: 'center',
    gap: AppTheme.spacing.xs,
  },
  title: {
    color: AppTheme.colors.onBackground,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: AppTheme.colors.outline,
    textAlign: 'center',
  },
  section: {
    width: '100%',
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radius.xl,
    padding: AppTheme.spacing.lg,
    gap: AppTheme.spacing.xs,
  },
  deferredItem: {
    paddingVertical: AppTheme.spacing.sm,
  },
  deferredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppTheme.spacing.sm,
  },
  deferredLabel: {
    color: AppTheme.colors.onBackground,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    opacity: 0.65,
  },
  deferredHint: {
    color: AppTheme.colors.outline,
    flexShrink: 0,
  },
  errorBlock: {
    width: '100%',
    gap: AppTheme.spacing.md,
  },
  errorText: { color: AppTheme.colors.error, textAlign: 'center' },
  button: {
    borderRadius: AppTheme.radius.lg,
  },
  buttonContent: { paddingVertical: AppTheme.spacing.sm },
});
