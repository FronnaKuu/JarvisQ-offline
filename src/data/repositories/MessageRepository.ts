// ─── Message Repository ───────────────────────────────────────────────────────

import { getDatabase, rowToMessage } from '../database';
import type { Message } from '@domain/types';

export async function getMessagesByConversation(
  conversationId: string,
): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp_ms: number;
    is_streaming: number;
  }>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp_ms ASC',
    [conversationId],
  );
  return rows.map(rowToMessage);
}

export async function insertMessage(message: Message): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO messages
       (id, conversation_id, role, text, timestamp_ms, is_streaming)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.conversationId,
      message.role,
      message.text,
      message.timestampMs,
      message.isStreaming ? 1 : 0,
    ],
  );
}

export async function updateMessageText(
  id: string,
  text: string,
  isStreaming: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE messages SET text = ?, is_streaming = ? WHERE id = ?',
    [text, isStreaming ? 1 : 0, id],
  );
}

export async function deleteMessagesByConversation(
  conversationId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM messages WHERE conversation_id = ?',
    [conversationId],
  );
}

export function makeMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  text = '',
  isStreaming = false,
): Message {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    conversationId,
    role,
    text,
    timestampMs: Date.now(),
    isStreaming,
  };
}
