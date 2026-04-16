// ─── Index — routing entry point ─────────────────────────────────────────────

import { Redirect } from 'expo-router';
import { useSettingsStore } from '@domain/SettingsStore';
import { useConversationStore } from '@domain/ConversationStore';
import { SttService } from '@core/inference/SttService';
import { LlmService } from '@core/inference/LlmService';
import { TtsService } from '@core/inference/TtsService';

export default function Index() {
  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const conversationsLoaded = useConversationStore((s) => s.isLoaded);
  const conversations = useConversationStore((s) => s.conversations);

  if (!settingsLoaded || !conversationsLoaded) {
    // Show nothing while loading state; _layout handles init
    return null;
  }

  // If models aren't loaded in memory (e.g. fresh app start after prior install),
  // go to setup. The SDK will load from disk cache — no re-download needed.
  const modelsLoaded = SttService.isLoaded && LlmService.isLoaded && TtsService.isLoaded;
  if (!modelsLoaded || conversations.length === 0) {
    return <Redirect href="/setup" />;
  }

  return <Redirect href="/conversation" />;
}
