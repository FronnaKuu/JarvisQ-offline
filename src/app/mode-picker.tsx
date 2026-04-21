// ---- Mode Picker Screen ---------------------------------------------------
// First-launch entry AND "+" new-chat entry: the user chooses between a free-
// form LLM conversation or a Bergamot translation session. Translation mode
// also picks source/target languages from AppConfig.translation.supportedPairs.
//
// The chosen mode is persisted on the conversation row, so each chat keeps
// its mode forever regardless of later setting changes.

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, Button, Chip, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { AppConfig } from '@core/config/AppConfig';
import { useBootstrapStore } from '@domain/BootstrapStore';
import { useConversationStore } from '@domain/ConversationStore';
import { useSettingsStore } from '@domain/SettingsStore';
import type { ConversationMode } from '@domain/types';
import { AppTheme } from '@ui/theme/theme';

type Selection = 'conversation' | 'translation';

export default function ModePickerScreen() {
  const router = useRouter();
  const createConversation = useConversationStore((s) => s.createConversation);
  const ensureResponder = useBootstrapStore((s) => s.ensureResponder);
  const settings = useSettingsStore((s) => s.settings);

  const [selection, setSelection] = useState<Selection>('conversation');
  const [pair, setPair] = useState<string>(
    `${settings.translationSourceLang}-${settings.translationTargetLang}`,
  );
  const [starting, setStarting] = useState(false);

  const supportedPairs = AppConfig.translation.supportedPairs;

  const pairOptions = useMemo(
    () =>
      supportedPairs.map((p) => {
        const [from, to] = p.split('-');
        return { id: p, label: `${(from ?? '').toUpperCase()} → ${(to ?? '').toUpperCase()}` };
      }),
    [supportedPairs],
  );

  const handleStart = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    try {
      const mode: ConversationMode = selection;
      let sourceLang: string | null = null;
      let targetLang: string | null = null;
      if (mode === 'translation') {
        const [from, to] = pair.split('-');
        sourceLang = from ?? null;
        targetLang = to ?? null;
      }

      // Load the matching responder before creating the chat, so the user
      // never lands on a conversation screen that cannot respond. Download
      // progress is surfaced by the bootstrap store in the splash UI if this
      // is the first time for the given mode/pair.
      await ensureResponder(mode, { sourceLang, targetLang });

      await createConversation(mode, { sourceLang, targetLang });
      router.replace('/conversation');
    } finally {
      setStarting(false);
    }
  }, [selection, pair, createConversation, ensureResponder, router, starting]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Appbar.Header style={styles.header} elevated={false} statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="New chat" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Choose how this chat should work.
        </Text>

        <View style={styles.boxes}>
          <ModeBox
            title="Conversation"
            subtitle="Free-form assistant powered by the on-device LLM."
            selected={selection === 'conversation'}
            onPress={() => setSelection('conversation')}
          />
          <ModeBox
            title="Translation"
            subtitle="Speak in one language, hear the other — via Bergamot NMT."
            selected={selection === 'translation'}
            onPress={() => setSelection('translation')}
          />
        </View>

        {selection === 'translation' ? (
          <View style={styles.pairBlock}>
            <Text variant="labelLarge" style={styles.pairLabel}>
              Language pair
            </Text>
            <View style={styles.pairRow}>
              {pairOptions.map((opt) => (
                <Chip
                  key={opt.id}
                  selected={pair === opt.id}
                  onPress={() => setPair(opt.id)}
                  style={styles.chip}
                >
                  {opt.label}
                </Chip>
              ))}
            </View>
          </View>
        ) : null}

        <Button
          mode="contained"
          style={styles.cta}
          contentStyle={styles.ctaContent}
          loading={starting}
          disabled={starting}
          onPress={() => void handleStart()}
        >
          Start
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModeBox({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: AppTheme.colors.surfaceVariant }}
      style={[styles.box, selected && styles.boxSelected]}
    >
      <Text variant="titleMedium" style={styles.boxTitle}>
        {title}
      </Text>
      <Text variant="bodySmall" style={styles.boxSubtitle}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppTheme.colors.background },
  header: {
    backgroundColor: AppTheme.colors.background,
    elevation: 0,
    height: 48,
  },
  headerTitle: {
    color: AppTheme.colors.onBackground,
    fontSize: AppTheme.typography.titleMedium.fontSize,
    fontWeight: AppTheme.typography.titleMedium.fontWeight,
  },
  content: {
    padding: AppTheme.spacing.lg,
    gap: AppTheme.spacing.lg,
  },
  subtitle: {
    color: AppTheme.colors.outline,
  },
  boxes: {
    gap: AppTheme.spacing.md,
  },
  box: {
    padding: AppTheme.spacing.lg,
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: AppTheme.spacing.xs,
  },
  boxSelected: {
    borderColor: AppTheme.colors.primary,
  },
  boxTitle: {
    color: AppTheme.colors.onBackground,
    fontWeight: '700',
  },
  boxSubtitle: {
    color: AppTheme.colors.outline,
  },
  pairBlock: {
    gap: AppTheme.spacing.sm,
  },
  pairLabel: {
    color: AppTheme.colors.onBackground,
  },
  pairRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.xs,
  },
  chip: {
    backgroundColor: AppTheme.colors.surface,
  },
  cta: {
    marginTop: AppTheme.spacing.md,
    borderRadius: AppTheme.radius.lg,
  },
  ctaContent: {
    paddingVertical: AppTheme.spacing.sm,
  },
});
