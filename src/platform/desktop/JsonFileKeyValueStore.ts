// ─── JSON-File Key-Value Adapter ─────────────────────────────────────────────
// Desktop implementation of IKeyValueStore backed by a single JSON file under
// the app-data directory. Chosen over a native KV (leveldb / sqlite) to keep
// the desktop dependency footprint at zero — settings are tiny and rewrites
// are atomic thanks to write-to-temp + rename.

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { IKeyValueStore } from '@core/ports/IKeyValueStore';

const FILE_NAME = 'settings.json';

export class JsonFileKeyValueStore implements IKeyValueStore {
  private readonly filePath: string;
  private cache: Record<string, string> | null = null;

  constructor(baseDirectory: string) {
    this.filePath = path.join(baseDirectory, FILE_NAME);
  }

  async getItem(key: string): Promise<string | null> {
    const data = await this.load();
    return data[key] ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const data = await this.load();
    data[key] = value;
    await this.persist(data);
  }

  async removeItem(key: string): Promise<void> {
    const data = await this.load();
    delete data[key];
    await this.persist(data);
  }

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    try {
      const raw = await fsp.readFile(this.filePath, 'utf8');
      this.cache = JSON.parse(raw) as Record<string, string>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      this.cache = {};
    }
    return this.cache;
  }

  private async persist(data: Record<string, string>): Promise<void> {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, this.filePath);
    this.cache = data;
  }
}
