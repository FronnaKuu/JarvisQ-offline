// ---- Conversations List Screen -------------------------------------------
// Lists persisted conversations with open / rename / delete actions. All
// persistence logic lives in ConversationStore (cross-platform); this screen
// only renders it.

import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Appbar,
  Button,
  Dialog,
  IconButton,
  List,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useConversationStore } from '@domain/ConversationStore';
import { AppTheme } from '@ui/theme/theme';
import type { Conversation } from '@domain/types';

export default function ConversationsListScreen() {
  const router = useRouter();
  const conversations = useConversationStore((s) => s.conversations);
  const selectConversation = useConversationStore((s) => s.selectConversation);
  const createConversation = useConversationStore((s) => s.createConversation);
  const deleteConversation = useConversationStore((s) => s.deleteConversation);
  const updateConversation = useConversationStore((s) => s.updateConversation);

  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const openConversation = useCallback(
    async (id: string) => {
      await selectConversation(id);
      router.replace('/conversation');
    },
    [router, selectConversation],
  );

  const handleNew = useCallback(async () => {
    await createConversation();
    router.replace('/conversation');
  }, [createConversation, router]);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameTarget) return;
    const title = renameDraft.trim();
    if (title.length > 0) {
      await updateConversation(renameTarget.id, { title });
    }
    setRenameTarget(null);
    setRenameDraft('');
  }, [renameDraft, renameTarget, updateConversation]);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Conversations" titleStyle={styles.headerTitle} />
        <IconButton
          icon="plus"
          iconColor={AppTheme.colors.onBackground}
          onPress={() => void handleNew()}
          accessibilityLabel="New conversation"
        />
      </Appbar.Header>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              No conversations yet. Start a new one with the + button.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <List.Item
            title={item.title}
            titleStyle={styles.itemTitle}
            description={new Date(item.lastUpdatedAt).toLocaleString()}
            descriptionStyle={styles.itemDescription}
            onPress={() => void openConversation(item.id)}
            style={styles.item}
            right={() => (
              <View style={styles.actions}>
                <IconButton
                  icon="pencil"
                  iconColor={AppTheme.colors.onSurfaceVariant}
                  accessibilityLabel="Rename conversation"
                  onPress={() => {
                    setRenameTarget(item);
                    setRenameDraft(item.title);
                  }}
                />
                <IconButton
                  icon="delete"
                  iconColor={AppTheme.colors.error}
                  accessibilityLabel="Delete conversation"
                  onPress={() => void deleteConversation(item.id)}
                />
              </View>
            )}
          />
        )}
      />

      <Portal>
        <Dialog
          visible={renameTarget !== null}
          onDismiss={() => setRenameTarget(null)}
          style={styles.dialog}
        >
          <Dialog.Title>Rename conversation</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRenameTarget(null)}>Cancel</Button>
            <Button onPress={() => void handleRenameConfirm()}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppTheme.colors.background },
  header: { backgroundColor: AppTheme.colors.background, elevation: 0 },
  headerTitle: {
    color: AppTheme.colors.onBackground,
    fontSize: AppTheme.typography.titleMedium.fontSize,
    fontWeight: AppTheme.typography.titleMedium.fontWeight,
  },
  listContent: {
    paddingVertical: AppTheme.spacing.sm,
  },
  item: {
    paddingHorizontal: AppTheme.spacing.lg,
  },
  itemTitle: {
    color: AppTheme.colors.onBackground,
  },
  itemDescription: {
    color: AppTheme.colors.outline,
  },
  actions: {
    flexDirection: 'row',
  },
  empty: {
    padding: AppTheme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: AppTheme.colors.outline,
    textAlign: 'center',
  },
  dialog: {
    backgroundColor: AppTheme.colors.surface,
  },
});
