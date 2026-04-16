// ---- Mobile Bootstrap ----------------------------------------------------
// Ensures the database is initialized before the app starts.
// Audio adapters are created on-demand via Platform.ts.

import { getDatabase } from '@data/database';

let bootstrapped = false;

export async function bootstrapMobile(): Promise<void> {
  if (bootstrapped) return;

  // Trigger database creation and migration.
  await getDatabase();

  bootstrapped = true;
}
