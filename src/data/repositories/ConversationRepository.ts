// ─── Conversation Repository ─────────────────────────────────────────────────

import {
  getDatabase,
  rowToConversation,
  type ConversationRow,
} from '../database';
import type { Conversation, ConversationMode } from '@domain/types';
import { AppConfig } from '@core/config/AppConfig';

export async function getAllConversations(): Promise<Conversation[]> {
  const rows = await getDatabase().getAll<ConversationRow>(
    'SELECT * FROM conversations ORDER BY last_updated_at DESC',
  );
  return rows.map(rowToConversation);
}

export async function getConversationById(
  id: string,
): Promise<Conversation | null> {
  const row = await getDatabase().getFirst<ConversationRow>(
    'SELECT * FROM conversations WHERE id = ?',
    [id],
  );
  return row ? rowToConversation(row) : null;
}

export async function insertConversation(
  conversation: Conversation,
): Promise<void> {
  await getDatabase().run(
    `INSERT INTO conversations
       (id, title, created_at, last_updated_at, system_prompt,
        max_context_turns, temperature, tts_speed, max_response_tokens,
        mode, source_lang, target_lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      conversation.id,
      conversation.title,
      conversation.createdAt,
      conversation.lastUpdatedAt,
      conversation.systemPrompt,
      conversation.maxContextTurns,
      conversation.temperature,
      conversation.ttsSpeed,
      conversation.maxResponseTokens,
      conversation.mode,
      conversation.sourceLang,
      conversation.targetLang,
    ],
  );
}

export async function updateConversation(
  id: string,
  fields: Partial<Omit<Conversation, 'id' | 'createdAt'>>,
): Promise<void> {
  const now = Date.now();
  const entries = Object.entries({
    ...fields,
    last_updated_at: fields.lastUpdatedAt ?? now,
  });
  if (entries.length === 0) return;

  const columnMap: Record<string, string> = {
    title: 'title',
    mode: 'mode',
    lastUpdatedAt: 'last_updated_at',
    systemPrompt: 'system_prompt',
    maxContextTurns: 'max_context_turns',
    temperature: 'temperature',
    ttsSpeed: 'tts_speed',
    maxResponseTokens: 'max_response_tokens',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
  };

  const setClauses = entries
    .map(([k]) => `${columnMap[k] ?? k} = ?`)
    .join(', ');
  const values = entries.map(([, v]) => v) as (string | number | boolean | null)[];

  await getDatabase().run(
    `UPDATE conversations SET ${setClauses} WHERE id = ?`,
    [...values, id],
  );
}

export async function deleteConversation(id: string): Promise<void> {
  await getDatabase().run('DELETE FROM conversations WHERE id = ?', [id]);
}

export interface NewConversationOptions {
  sourceLang?: string | null;
  targetLang?: string | null;
  title?: string;
}

export function makeNewConversation(
  mode: ConversationMode = 'conversation',
  opts: NewConversationOptions = {},
): Conversation {
  const now = Date.now();
  return {
    id: `conv_${now}_${Math.random().toString(16).slice(2)}`,
    title: opts.title ?? AppConfig.conversation.defaultTitle,
    mode,
    createdAt: now,
    lastUpdatedAt: now,
    systemPrompt: AppConfig.conversation.defaultSystemPrompt,
    maxContextTurns: AppConfig.conversation.maxContextTurns,
    temperature: AppConfig.llm.defaultTemperature,
    ttsSpeed: AppConfig.tts.defaultSpeed,
    maxResponseTokens: AppConfig.llm.defaultMaxTokens,
    sourceLang: mode === 'translation' ? (opts.sourceLang ?? null) : null,
    targetLang: mode === 'translation' ? (opts.targetLang ?? null) : null,
  };
}
