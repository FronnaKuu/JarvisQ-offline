// ─── Message Repository ──────────────────────────────────────────────────────

import { getDatabase, rowToMessage, type MessageRow } from '../database';
import type { Message } from '@domain/types';

export async function getMessagesByConversation(
  conversationId: string,
): Promise<Message[]> {
  const rows = await getDatabase().getAll<MessageRow>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp_ms ASC',
    [conversationId],
  );
  return rows.map(rowToMessage);
}

export async function insertMessage(message: Message): Promise<void> {
  await getDatabase().run(
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
  await getDatabase().run(
    'UPDATE messages SET text = ?, is_streaming = ? WHERE id = ?',
    [text, isStreaming ? 1 : 0, id],
  );
}

export async function deleteMessagesByConversation(
  conversationId: string,
): Promise<void> {
  await getDatabase().run(
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
