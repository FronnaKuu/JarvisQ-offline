// ---- Numeric Setting Row -------------------------------------------------
// Reusable labeled numeric input with min/max validation. Commits the parsed
// value on blur; invalid input reverts to the last committed value.

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { HelperText, Text, TextInput } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';

interface Props {
  label: string;
  value: number;
  onCommit: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  helper?: string;
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

export function NumericSettingRow({
  label,
  value,
  onCommit,
  min,
  max,
  helper,
}: Props) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      const clamped = clamp(parsed, min, max);
      onCommit(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <View style={styles.row}>
      <Text variant="bodyMedium" style={styles.label}>
        {label}
      </Text>
      <TextInput
        mode="outlined"
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        keyboardType="numeric"
        style={styles.input}
        outlineColor={AppTheme.colors.surfaceVariant}
        activeOutlineColor={AppTheme.colors.primary}
        textColor={AppTheme.colors.onBackground}
        dense
      />
      {helper ? (
        <HelperText type="info" style={styles.helper}>
          {helper}
        </HelperText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: AppTheme.spacing.xs,
  },
  label: {
    color: AppTheme.colors.onBackground,
  },
  input: {
    backgroundColor: AppTheme.colors.surface,
  },
  helper: {
    color: AppTheme.colors.outline,
  },
});
