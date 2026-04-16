// ─── Database Accessor ───────────────────────────────────────────────────────
// Thin facade over the IDatabase port resolved from the platform container.
// Repositories use `getDatabase()` without knowing which SQLite driver backs
// the app (expo-sqlite on mobile, better-sqlite3 on desktop, sql.js on web).

import { getPlatform } from '@core/platform/PlatformContainer';
import type { IDatabase } from '@core/ports';

export function getDatabase(): IDatabase {
  return getPlatform().database;
}

export { rowToConversation, rowToMessage } from './rowMappers';
export type { ConversationRow, MessageRow } from './rowMappers';
