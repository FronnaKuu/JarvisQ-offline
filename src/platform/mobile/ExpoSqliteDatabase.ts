// ─── Expo SQLite Adapter ─────────────────────────────────────────────────────
// Mobile implementation of IDatabase backed by `expo-sqlite`. Owns the open
// database handle and runs the schema migration on construction.

import * as SQLite from 'expo-sqlite';
import type { IDatabase, SqlParam } from '@core/ports/IDatabase';

// Filename kept under the legacy name so the JarvisQVAC -> JarvisQ rename
// does not orphan user conversations on existing installs.
const DB_NAME = 'jarvisqvac.db';

const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_updated_at INTEGER NOT NULL,
    system_prompt TEXT NOT NULL DEFAULT '',
    max_context_turns INTEGER NOT NULL DEFAULT 10,
    temperature REAL NOT NULL DEFAULT 0.7,
    tts_speed REAL NOT NULL DEFAULT 1.0,
    max_response_tokens INTEGER NOT NULL DEFAULT 256,
    mode TEXT NOT NULL DEFAULT 'conversation',
    source_lang TEXT,
    target_lang TEXT
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
`;

const MIGRATIONS: readonly string[] = [
  `ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'conversation'`,
  `ALTER TABLE conversations ADD COLUMN source_lang TEXT`,
  `ALTER TABLE conversations ADD COLUMN target_lang TEXT`,
];

export class ExpoSqliteDatabase implements IDatabase {
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  static async open(): Promise<ExpoSqliteDatabase> {
    const handle = await SQLite.openDatabaseAsync(DB_NAME);
    await handle.execAsync(SCHEMA_SQL);
    // Idempotent migrations for DBs created before the translation-mode columns
    // existed. SQLite rejects `ALTER TABLE ADD COLUMN IF NOT EXISTS` before
    // 3.35, so we catch the "duplicate column" error instead.
    for (const sql of MIGRATIONS) {
      try { await handle.execAsync(sql); } catch { /* already applied */ }
    }
    return new ExpoSqliteDatabase(handle);
  }

  exec(sql: string): Promise<void> {
    return this.db.execAsync(sql);
  }

  async run(sql: string, params?: readonly SqlParam[]): Promise<void> {
    await this.db.runAsync(sql, ...(params ?? []));
  }

  getFirst<Row extends object>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<Row | null> {
    // expo-sqlite's generic requires an index signature; our domain row types
    // use explicit fields. The cast is safe because the caller picks the shape.
    return this.db.getFirstAsync(sql, ...(params ?? [])) as Promise<Row | null>;
  }

  getAll<Row extends object>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<Row[]> {
    return this.db.getAllAsync(sql, ...(params ?? [])) as Promise<Row[]>;
  }
}
