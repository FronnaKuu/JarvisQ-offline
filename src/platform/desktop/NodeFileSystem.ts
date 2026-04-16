// ─── Node File System Adapter ────────────────────────────────────────────────
// Desktop (Windows/macOS/Linux) implementation of IFileSystem backed by Node's
// built-in `node:fs/promises`, `node:https`, and `node:http` modules. No extra
// dependencies — runs in plain Node 20+, Electron, Pear, and Tauri's sidecar.
//
// Design notes
// ------------
// * `download` supports the `Range` header and streams the response straight to
//   disk, so ~2.5 GB model files never sit in memory.
// * Redirects (301/302/307/308) are followed up to a sensible depth so pinned
//   HuggingFace URLs that bounce through CDN hosts resolve transparently.

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';
import type {
  DownloadOptions,
  FileInfo,
  IFileSystem,
} from '@core/ports/IFileSystem';
import { getDocumentDirectoryWithSep } from './paths';

const MAX_REDIRECTS = 5;

export class NodeFileSystem implements IFileSystem {
  readonly documentDirectory: string = getDocumentDirectoryWithSep();

  async getInfo(path: string): Promise<FileInfo> {
    try {
      const stat = await fsp.stat(path);
      return {
        exists: true,
        isDirectory: stat.isDirectory(),
        size: Number(stat.size),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { exists: false, isDirectory: false, size: 0 };
      }
      throw err;
    }
  }

  async makeDirectory(
    path: string,
    options?: { intermediates?: boolean },
  ): Promise<void> {
    await fsp.mkdir(path, { recursive: options?.intermediates ?? true });
  }

  async move(args: { from: string; to: string }): Promise<void> {
    await fsp.rename(args.from, args.to);
  }

  async download(
    url: string,
    destination: string,
    options?: DownloadOptions,
  ): Promise<string> {
    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(destination);
      file.on('error', reject);

      const request = (target: string, redirectsLeft: number): void => {
        const parsed = new URL(target);
        const client = parsed.protocol === 'http:' ? http : https;
        const req = client.get(
          target,
          {
            headers: {
              'User-Agent': 'qvac-sdk',
              ...(options?.headers ?? {}),
            },
          },
          (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              if (redirectsLeft <= 0) {
                reject(new Error(`Too many redirects for ${url}`));
                return;
              }
              res.resume();
              request(new URL(res.headers.location, target).toString(), redirectsLeft - 1);
              return;
            }
            if (!res.statusCode || res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode} for ${url}`));
              res.resume();
              return;
            }

            const expected = Number(res.headers['content-length'] ?? 0);
            let written = 0;
            res.on('data', (chunk: Buffer) => {
              written += chunk.length;
              options?.onProgress?.({
                bytesWritten: written,
                bytesExpected: expected,
              });
            });
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
          },
        );
        req.on('error', reject);
      };

      request(url, MAX_REDIRECTS);
    });

    return destination;
  }
}
