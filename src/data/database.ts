// ---- SQLite Database -----------------------------------------------------
// Schema, migrations, and singleton instance.

import * as SQLite from 'expo-sqlite';
import type { Conversation, Message } from '@domain/types';

const DB_NAME = 'jarvisqvac.db';
const DB_VERSION = 1;

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await migrate(_db);
  return _db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`PRAGMA journal_mode = WAL;`);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      last_updated_at INTEGER NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      max_context_turns INTEGER NOT NULL DEFAULT 10,
      temperature REAL NOT NULL DEFAULT 0.7,
      tts_speed REAL NOT NULL DEFAULT 1.0,
      max_response_tokens INTEGER NOT NULL DEFAULT 256
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      text TEXT NOT NULL DEFAULT '',
      timestamp_ms INTEGER NOT NULL,
      is_streaming INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id);
  `);
}

// ---- Row mapping helpers -------------------------------------------------

type ConversationRow = {
  id: string;
  title: string;
  created_at: number;
  last_updated_at: number;
  system_prompt: string;
  max_context_turns: number;
  temperature: number;
  tts_speed: number;
  max_response_tokens: number;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp_ms: number;
  is_streaming: number;
};

export function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    lastUpdatedAt: row.last_updated_at,
    systemPrompt: row.system_prompt,
    maxContextTurns: row.max_context_turns,
    temperature: row.temperature,
    ttsSpeed: row.tts_speed,
    maxResponseTokens: row.max_response_tokens,
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

export { DB_VERSION };
