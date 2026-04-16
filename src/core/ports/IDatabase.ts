// ─── Database Port ───────────────────────────────────────────────────────────
// Minimal SQL contract modelled on expo-sqlite's async API but platform-free.
// Adapters: expo-sqlite (mobile), better-sqlite3 (desktop), sql.js (web).
//
// Rationale for a tiny surface: repositories in this project use only three
// operations (exec, getAll, getFirst, run). Keeping the port small avoids
// over-fitting to a single driver and makes alternate adapters trivial.

export type SqlParam = string | number | boolean | null | Uint8Array;
export type SqlRow = { [column: string]: unknown };

export interface IDatabase {
  /** Executes one or more statements without returning rows (DDL, PRAGMA). */
  exec(sql: string): Promise<void>;

  /** Runs a parameterised statement and returns write metadata. */
  run(sql: string, params?: readonly SqlParam[]): Promise<void>;

  /** Returns the first row matching the query, or null when empty. */
  getFirst<Row extends object>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<Row | null>;

  /** Returns every row matching the query. */
  getAll<Row extends object>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<Row[]>;
}
