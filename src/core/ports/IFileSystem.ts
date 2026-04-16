// ─── File System Port ────────────────────────────────────────────────────────
// Platform-agnostic contract for file I/O operations used by the core layer.
// Adapters live under `src/platform/<target>/` (e.g. ExpoFileSystem for mobile,
// NodeFileSystem for desktop). The core must never import a concrete FS module.

export interface FileInfo {
  exists: boolean;
  isDirectory: boolean;
  size: number;
}

export interface DownloadProgressEvent {
  bytesWritten: number;
  bytesExpected: number;
}

export type DownloadProgressListener = (event: DownloadProgressEvent) => void;

export interface DownloadOptions {
  headers?: Record<string, string>;
  onProgress?: DownloadProgressListener;
}

export interface IFileSystem {
  /**
   * Absolute path (with trailing separator) to the application's writable
   * document directory. Models and caches are stored under this root.
   */
  readonly documentDirectory: string;

  getInfo(path: string): Promise<FileInfo>;

  makeDirectory(path: string, options?: { intermediates?: boolean }): Promise<void>;

  move(args: { from: string; to: string }): Promise<void>;

  /**
   * Downloads a remote resource to `destination` with optional range headers
   * and progress reporting. Resolves with the final local path.
   */
  download(url: string, destination: string, options?: DownloadOptions): Promise<string>;
}
