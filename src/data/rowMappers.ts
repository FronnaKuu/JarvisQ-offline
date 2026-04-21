// ─── Row Mappers ─────────────────────────────────────────────────────────────
// Converts raw SQL rows (snake_case column names) to domain objects. Kept in
// a separate module so repositories depend only on pure functions and the
// IDatabase port — no concrete SQLite driver types leak up.

import type { Conversation, ConversationMode, Message } from '@domain/types';

export interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  last_updated_at: number;
  system_prompt: string;
  max_context_turns: number;
  temperature: number;
  tts_speed: number;
  max_response_tokens: number;
  mode: string | null;
  source_lang: string | null;
  target_lang: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp_ms: number;
  is_streaming: number;
}

export function rowToConversation(row: ConversationRow): Conversation {
  // DBs migrated from pre-translation schemas return null for mode; treat as
  // the historical default so existing chats keep working.
  const mode: ConversationMode =
    row.mode === 'translation' ? 'translation' : 'conversation';
  return {
    id: row.id,
    title: row.title,
    mode,
    createdAt: row.created_at,
    lastUpdatedAt: row.last_updated_at,
    systemPrompt: row.system_prompt,
    maxContextTurns: row.max_context_turns,
    temperature: row.temperature,
    ttsSpeed: row.tts_speed,
    maxResponseTokens: row.max_response_tokens,
    sourceLang: row.source_lang ?? null,
    targetLang: row.target_lang ?? null,
  };
}

export function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    text: row.text,
    timestampMs: row.timestamp_ms,
    isStreaming: row.is_streaming === 1,
  };
}
