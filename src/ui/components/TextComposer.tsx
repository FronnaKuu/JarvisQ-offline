// ---- Text Composer -------------------------------------------------------
// Text fallback input used when the user wants to type instead of speaking.
// Stays dumb: owns only the draft; submit/cancel are delegated upward.

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, TextInput } from 'react-native-paper';
import { AppTheme } from '@ui/theme/theme';

interface Props {
  disabled?: boolean;
  onSubmit: (text: string) => void;
}

export function TextComposer({ disabled = false, onSubmit }: Props) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setDraft('');
  };

  return (
    <View style={styles.row}>
      <TextInput
        mode="outlined"
        value={draft}
        onChangeText={setDraft}
        placeholder="Type a message"
        style={styles.input}
        outlineColor={AppTheme.colors.surfaceVariant}
        activeOutlineColor={AppTheme.colors.primary}
        textColor={AppTheme.colors.onBackground}
        onSubmitEditing={submit}
        returnKeyType="send"
        multiline
        blurOnSubmit
        disabled={disabled}
        accessibilityLabel="Message input"
      />
      <IconButton
        icon="send"
        mode="contained"
        size={24}
        disabled={disabled || draft.trim().length === 0}
        onPress={submit}
        accessibilityLabel="Send message"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: AppTheme.spacing.sm,
    paddingHorizontal: AppTheme.spacing.lg,
    width: '100%',
  },
  input: {
    flex: 1,
    backgroundColor: AppTheme.colors.surface,
    maxHeight: 120,
  },
});
