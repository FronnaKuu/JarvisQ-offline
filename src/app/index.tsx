// ---- Splash / Bootstrap Screen -------------------------------------------
// Entry route: requests microphone permission, ensures all inference models
// are loaded (from cache or via download), then redirects to the conversation
// screen. Replaces the previous hard split between /setup and /conversation
// so returning users never see a "Download & Setup" button when the cache is
// already warm.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ProgressBar, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useBootstrapStore } from '@domain/BootstrapStore';
import { useSettingsStore } from '@domain/SettingsStore';
import { useConversationStore } from '@domain/ConversationStore';
import { getPlatform } from '@core/platform/PlatformContainer';
import { AppTheme } from '@ui/theme/theme';
import type { ServiceKind } from '@core/bootstrap/AppBootstrap';

// Only the always-on services run during bootstrap. The responder (llm or
// Bergamot translator) is downloaded lazily when the user first opens a
// chat of that mode, so it does not contribute to this progress bar.
const SERVICE_ORDER: ServiceKind[] = ['stt', 'tts'];

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
    // Existing users land on their last chat; first-run (empty list) routes to
    // the mode picker so the user chooses 'conversation' or 'translation'
    // before any responder model is downloaded.
    router.replace(hasConversations ? '/conversation' : '/mode-picker');
  }, [phase, hasConversations, router]);

  const { overallPercent, hasProgress } = useMemo(() => {
    let sum = 0;
    let anyProgress = false;
    for (const kind of SERVICE_ORDER) {
      const s = services[kind];
      if (s.phase === 'done') {
        sum += 100;
      } else if (s.progress) {
        sum += s.progress.percentage;
        anyProgress = true;
      }
    }
    return {
      overallPercent: sum / SERVICE_ORDER.length,
      hasProgress: anyProgress,
    };
  }, [services]);

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
            JarvisQVAC
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {statusLabel}
          </Text>
        </View>

        {phase !== 'error' ? (
          <ProgressBar
            indeterminate={!hasProgress}
            progress={hasProgress ? overallPercent / 100 : 0}
            style={styles.bar}
            color={AppTheme.colors.primary}
          />
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
  bar: {
    height: 3,
    width: '60%',
    borderRadius: AppTheme.radius.sm,
    backgroundColor: AppTheme.colors.surfaceVariant,
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
