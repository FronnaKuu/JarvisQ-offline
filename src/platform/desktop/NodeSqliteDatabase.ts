// ─── Node SQLite Adapter ─────────────────────────────────────────────────────
// Desktop implementation of IDatabase backed by the built-in `node:sqlite`
// module (stable from Node 22+). No native dependency and no compile step —
// the bindings ship with Node itself.
//
// Schema is kept in sync with ExpoSqliteDatabase on mobile so repositories and
// migrations are portable.

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import * as path from 'node:path';
import type { IDatabase, SqlParam } from '@core/ports/IDatabase';

const DB_FILENAME = 'jarvisqvac.db';

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
`;

/**
 * `node:sqlite` accepts only `null | number | bigint | string | Uint8Array` as
 * bound parameters. Booleans used by the port are coerced to 0 / 1.
 */
function coerceParams(
  params: readonly SqlParam[] | undefined,
): SQLInputValue[] {
  if (!params) return [];
  return params.map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p as SQLInputValue;
  });
}

export class NodeSqliteDatabase implements IDatabase {
  private constructor(private readonly db: DatabaseSync) {}

  static async open(baseDirectory: string): Promise<NodeSqliteDatabase> {
    const dbPath = path.join(baseDirectory, DB_FILENAME);
    const handle = new DatabaseSync(dbPath);
    handle.exec(SCHEMA_SQL);
    return new NodeSqliteDatabase(handle);
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params?: readonly SqlParam[]): Promise<void> {
    const stmt = this.db.prepare(sql);
    stmt.run(...coerceParams(params));
  }

  async getFirst<Row extends object>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<Row | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...coerceParams(params));
    return (row as Row | undefined) ?? null;
  }

  async getAll<Row extends object>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<Row[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...coerceParams(params)) as Row[];
  }
}
