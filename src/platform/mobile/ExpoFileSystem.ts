// ─── Expo File System Adapter ────────────────────────────────────────────────
// Mobile implementation of IFileSystem backed by `expo-file-system/legacy`.
// The legacy API exposes `createDownloadResumable` with progress callbacks and
// range-header support, which we need for large model downloads.

import * as FileSystem from 'expo-file-system/legacy';
import type {
  DownloadOptions,
  FileInfo,
  IFileSystem,
} from '@core/ports/IFileSystem';

export class ExpoFileSystem implements IFileSystem {
  readonly documentDirectory: string;

  constructor() {
    const base = FileSystem.documentDirectory;
    if (!base) throw new Error('expo-file-system documentDirectory is null');
    this.documentDirectory = base;
  }

  async getInfo(path: string): Promise<FileInfo> {
    const info = await FileSystem.getInfoAsync(path);
    return {
      exists: info.exists,
      isDirectory: info.exists ? !!info.isDirectory : false,
      size: info.exists ? (info.size ?? 0) : 0,
    };
  }

  async makeDirectory(
    path: string,
    options?: { intermediates?: boolean },
  ): Promise<void> {
    await FileSystem.makeDirectoryAsync(path, {
      intermediates: options?.intermediates ?? true,
    });
  }

  async move(args: { from: string; to: string }): Promise<void> {
    await FileSystem.moveAsync(args);
  }

  async download(
    url: string,
    destination: string,
    options?: DownloadOptions,
  ): Promise<string> {
    const callback = options?.onProgress
      ? (e: FileSystem.DownloadProgressData) =>
          options.onProgress!({
            bytesWritten: e.totalBytesWritten,
            bytesExpected: e.totalBytesExpectedToWrite,
          })
      : undefined;

    const resumable = FileSystem.createDownloadResumable(
      url,
      destination,
      options?.headers ? { headers: options.headers } : {},
      callback,
    );
    const result = await resumable.downloadAsync();
    if (!result) throw new Error(`Download returned null for ${url}`);
    return result.uri;
  }
}
