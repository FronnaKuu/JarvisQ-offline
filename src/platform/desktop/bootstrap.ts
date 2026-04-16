// ─── Desktop Bootstrap ───────────────────────────────────────────────────────
// Instantiates desktop adapters and registers them into the platform
// container. Must be awaited before any core service is used — call this from
// the desktop entry point (Electron main process bridge, Tauri command, or a
// plain Node CLI).

import * as fsp from 'node:fs/promises';
import { registerPlatform } from '@core/platform/PlatformContainer';
import { NodeFileSystem } from './NodeFileSystem';
import { JsonFileKeyValueStore } from './JsonFileKeyValueStore';
import { NodeSqliteDatabase } from './NodeSqliteDatabase';
import { getAppDataDirectory } from './paths';

let bootstrapped = false;

export async function bootstrapDesktop(): Promise<void> {
  if (bootstrapped) return;

  const baseDirectory = getAppDataDirectory();
  await fsp.mkdir(baseDirectory, { recursive: true });

  const database = await NodeSqliteDatabase.open(baseDirectory);
  registerPlatform({
    fileSystem: new NodeFileSystem(),
    keyValueStore: new JsonFileKeyValueStore(baseDirectory),
    database,
  });

  bootstrapped = true;
}
