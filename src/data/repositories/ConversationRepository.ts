// ─── Conversation Repository ──────────────────────────────────────────────────

import { getDatabase, rowToConversation } from '../database';
import type { Conversation } from '@domain/types';
import { AppConfig } from '@core/config/AppConfig';

export async function getAllConversations(): Promise<Conversation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    created_at: number;
    last_updated_at: number;
    system_prompt: string;
    max_context_turns: number;
    temperature: number;
    tts_speed: number;
    max_response_tokens: number;
  }>('SELECT * FROM conversations ORDER BY last_updated_at DESC');
  return rows.map(rowToConversation);
}

export async function getConversationById(
  id: string,
): Promise<Conversation | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    title: string;
    created_at: number;
    last_updated_at: number;
    system_prompt: string;
    max_context_turns: number;
    temperature: number;
    tts_speed: number;
    max_response_tokens: number;
  }>('SELECT * FROM conversations WHERE id = ?', [id]);
  return row ? rowToConversation(row) : null;
}

export async function insertConversation(
  conversation: Conversation,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO conversations
       (id, title, created_at, last_updated_at, system_prompt,
        max_context_turns, temperature, tts_speed, max_response_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ],
  );
}

export async function updateConversation(
  id: string,
  fields: Partial<Omit<Conversation, 'id' | 'createdAt'>>,
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  const entries = Object.entries({
    ...fields,
    last_updated_at: fields.lastUpdatedAt ?? now,
  });
  if (entries.length === 0) return;

  const columnMap: Record<string, string> = {
    title: 'title',
    lastUpdatedAt: 'last_updated_at',
    systemPrompt: 'system_prompt',
    maxContextTurns: 'max_context_turns',
    temperature: 'temperature',
    ttsSpeed: 'tts_speed',
    maxResponseTokens: 'max_response_tokens',
  };

  const setClauses = entries
    .map(([k]) => `${columnMap[k] ?? k} = ?`)
    .join(', ');
  const values = entries.map(([, v]) => v);

  await db.runAsync(
    `UPDATE conversations SET ${setClauses} WHERE id = ?`,
    [...values, id],
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM conversations WHERE id = ?', [id]);
}

export function makeNewConversation(): Conversation {
  const now = Date.now();
  return {
    id: `conv_${now}_${Math.random().toString(16).slice(2)}`,
    title: AppConfig.conversation.defaultTitle,
    createdAt: now,
    lastUpdatedAt: now,
    systemPrompt: AppConfig.conversation.defaultSystemPrompt,
    maxContextTurns: AppConfig.conversation.maxContextTurns,
    temperature: AppConfig.llm.defaultTemperature,
    ttsSpeed: AppConfig.tts.defaultSpeed,
    maxResponseTokens: AppConfig.llm.defaultMaxTokens,
  };
}
