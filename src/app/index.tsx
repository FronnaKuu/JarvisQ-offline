// ─── Index — routing entry point ─────────────────────────────────────────────

import { Redirect } from 'expo-router';
import { useSettingsStore } from '@domain/SettingsStore';
import { useConversationStore } from '@domain/ConversationStore';

export default function Index() {
  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const conversationsLoaded = useConversationStore((s) => s.isLoaded);
  const conversations = useConversationStore((s) => s.conversations);

  if (!settingsLoaded || !conversationsLoaded) {
    // Show nothing while loading state; _layout handles init
    return null;
  }

  // If no conversations exist yet, go to setup; otherwise go to conversation
  if (conversations.length === 0) {
    return <Redirect href="/setup" />;
  }
  return <Redirect href="/conversation" />;
}
