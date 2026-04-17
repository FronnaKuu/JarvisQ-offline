// ─── Desktop App-Data Directory ──────────────────────────────────────────────
// Resolves the OS-specific writable directory used by the desktop adapters.
// Mirrors the conventions used by Electron's `app.getPath('userData')` and
// Tauri's `BaseDirectory.AppData`, but without pulling in either dependency.

import * as os from 'node:os';
import * as path from 'node:path';

const APP_DIRECTORY_NAME = 'JarvisQVAC';

/**
 * Returns the platform-appropriate writable application data directory.
 *
 * - Windows  → %APPDATA%/JarvisQVAC            (e.g. C:/Users/<u>/AppData/Roaming/JarvisQVAC)
 * - macOS    → ~/Library/Application Support/JarvisQVAC
 * - Linux    → $XDG_DATA_HOME/JarvisQVAC or ~/.local/share/JarvisQVAC
 */
export function getAppDataDirectory(): string {
  switch (process.platform) {
    case 'win32': {
      const base = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(base, APP_DIRECTORY_NAME);
    }
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', APP_DIRECTORY_NAME);
    default: {
      const base = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
      return path.join(base, APP_DIRECTORY_NAME);
    }
  }
}

/** IFileSystem.documentDirectory expects a trailing separator. */
export function getDocumentDirectoryWithSep(): string {
  return getAppDataDirectory() + path.sep;
}

/**
 * Writable cache directory under the app-data root. Used for transient files
 * like microphone captures sent to the STT service.
 */
export function getCacheDirectory(): string {
  return path.join(getAppDataDirectory(), 'cache');
}
