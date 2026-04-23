// ---- Mode Picker Screen ---------------------------------------------------
// First-launch entry AND "+" new-chat entry: the user chooses between a free-
// form LLM conversation or a Bergamot translation session. Translation mode
// also picks source/target languages from the Bergamot catalog in ModelConfig.
//
// The chosen mode is persisted on the conversation row, so each chat keeps
// its mode forever regardless of later setting changes.

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, Button, Menu, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import {
  BERGAMOT_SOURCE_LANGS,
  BERGAMOT_TARGET_LANGS,
  resolveTranslatorPair,
} from '@core/config/ModelConfig';
import { useBootstrapStore } from '@domain/BootstrapStore';
import { useConversationStore } from '@domain/ConversationStore';
import { useSettingsStore } from '@domain/SettingsStore';
import type { ConversationMode } from '@domain/types';
import { AppTheme } from '@ui/theme/theme';

type Selection = 'conversation' | 'translation';

// Intl.DisplayNames is available in Hermes since RN 0.73; falls back to the
// bare code if the runtime doesn't support it.
function makeLangLabeler(): (code: string) => string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    return (code) => {
      const name = dn.of(code);
      return name && name !== code ? `${name} (${code.toUpperCase()})` : code.toUpperCase();
    };
  } catch {
    return (code) => code.toUpperCase();
  }
}

export default function ModePickerScreen() {
  const router = useRouter();
  const createConversation = useConversationStore((s) => s.createConversation);
  const ensureResponder = useBootstrapStore((s) => s.ensureResponder);
  const settings = useSettingsStore((s) => s.settings);

  const [selection, setSelection] = useState<Selection>('conversation');
  const [fromLang, setFromLang] = useState<string>(settings.translationSourceLang);
  const [toLang, setToLang] = useState<string>(settings.translationTargetLang);
  const [fromMenuOpen, setFromMenuOpen] = useState(false);
  const [toMenuOpen, setToMenuOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const langLabel = useMemo(makeLangLabeler, []);

  const sortedSources = useMemo(
    () =>
      [...BERGAMOT_SOURCE_LANGS].sort((a, b) =>
        langLabel(a).localeCompare(langLabel(b)),
      ),
    [langLabel],
  );
  const sortedTargets = useMemo(
    () =>
      [...BERGAMOT_TARGET_LANGS].sort((a, b) =>
        langLabel(a).localeCompare(langLabel(b)),
      ),
    [langLabel],
  );

  const resolution = useMemo(
    () => resolveTranslatorPair(fromLang, toLang),
    [fromLang, toLang],
  );

  const routeHint =
    resolution.kind === 'direct'
      ? 'Direct model (~30 MB)'
      : resolution.kind === 'pivot'
        ? `Via English (2 models, ~60 MB)`
        : fromLang === toLang
          ? 'Source and target must differ'
          : 'Unsupported — this target has no English→X model';

  const canStart =
    selection === 'conversation' || resolution.kind !== 'unsupported';

  const handleStart = useCallback(async () => {
    if (starting || !canStart) return;
    setStarting(true);
    try {
      const mode: ConversationMode = selection;
      let sourceLang: string | null = null;
      let targetLang: string | null = null;
      if (mode === 'translation') {
        sourceLang = fromLang;
        targetLang = toLang;
      }

      await ensureResponder(mode, { sourceLang, targetLang });
      await createConversation(mode, { sourceLang, targetLang });
      router.replace('/conversation');
    } finally {
      setStarting(false);
    }
  }, [selection, fromLang, toLang, canStart, createConversation, ensureResponder, router, starting]);

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
              Languages
            </Text>
            <View style={styles.langRow}>
              <LangPicker
                label="From"
                value={fromLang}
                options={sortedSources}
                labelFor={langLabel}
                open={fromMenuOpen}
                onOpen={() => setFromMenuOpen(true)}
                onDismiss={() => setFromMenuOpen(false)}
                onPick={(code) => {
                  setFromLang(code);
                  setFromMenuOpen(false);
                }}
              />
              <LangPicker
                label="To"
                value={toLang}
                options={sortedTargets}
                labelFor={langLabel}
                open={toMenuOpen}
                onOpen={() => setToMenuOpen(true)}
                onDismiss={() => setToMenuOpen(false)}
                onPick={(code) => {
                  setToLang(code);
                  setToMenuOpen(false);
                }}
              />
            </View>
            <Text
              variant="bodySmall"
              style={[
                styles.routeHint,
                resolution.kind === 'unsupported' && styles.routeHintError,
              ]}
            >
              {routeHint}
            </Text>
          </View>
        ) : null}

        <Button
          mode="contained"
          style={styles.cta}
          contentStyle={styles.ctaContent}
          loading={starting}
          disabled={starting || !canStart}
          onPress={() => void handleStart()}
        >
          Start
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

function LangPicker({
  label,
  value,
  options,
  labelFor,
  open,
  onOpen,
  onDismiss,
  onPick,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<string>;
  labelFor: (code: string) => string;
  open: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  onPick: (code: string) => void;
}) {
  return (
    <View style={styles.langCol}>
      <Text variant="labelSmall" style={styles.langLabel}>
        {label}
      </Text>
      <Menu
        visible={open}
        onDismiss={onDismiss}
        anchor={
          <Pressable
            onPress={onOpen}
            android_ripple={{ color: AppTheme.colors.surfaceVariant }}
            style={styles.langButton}
          >
            <Text variant="bodyMedium" style={styles.langButtonText} numberOfLines={1}>
              {labelFor(value)}
            </Text>
          </Pressable>
        }
        contentStyle={styles.menuContent}
      >
        <ScrollView style={styles.menuScroll}>
          {options.map((code) => (
            <Menu.Item
              key={code}
              onPress={() => onPick(code)}
              title={labelFor(code)}
              titleStyle={code === value ? styles.menuItemActive : undefined}
            />
          ))}
        </ScrollView>
      </Menu>
    </View>
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
  langRow: {
    flexDirection: 'row',
    gap: AppTheme.spacing.md,
  },
  langCol: {
    flex: 1,
    gap: AppTheme.spacing.xs,
  },
  langLabel: {
    color: AppTheme.colors.outline,
  },
  langButton: {
    padding: AppTheme.spacing.md,
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    borderColor: AppTheme.colors.outline,
  },
  langButtonText: {
    color: AppTheme.colors.onBackground,
  },
  menuContent: {
    backgroundColor: AppTheme.colors.surface,
    maxHeight: 360,
  },
  menuScroll: {
    maxHeight: 360,
  },
  menuItemActive: {
    color: AppTheme.colors.primary,
    fontWeight: '700',
  },
  routeHint: {
    color: AppTheme.colors.outline,
  },
  routeHintError: {
    color: AppTheme.colors.error,
  },
  cta: {
    marginTop: AppTheme.spacing.md,
    borderRadius: AppTheme.radius.lg,
  },
  ctaContent: {
    paddingVertical: AppTheme.spacing.sm,
  },
});
