// ─── TTS Companion File Downloader ───────────────────────────────────────────
// Downloads Supertonic ONNX models and their companion .onnx_data files to the
// same directory with original filenames. The SDK's default HTTP downloader
// prefixes saved files with a content hash, which breaks ONNX Runtime's
// resolution of companion `.onnx_data` files (they must sit next to the
// `.onnx` graph with the exact filename).
//
// This utility is platform-agnostic: it receives an IFileSystem adapter via DI.

import { AppConfig } from '@core/config/AppConfig';
import type { ModelProgressUpdate } from '@qvac/sdk';
import type { IFileSystem } from '@core/ports/IFileSystem';

interface DownloadEntry {
  url: string;
  filename: string;
  expectedBytes?: number;
}

export interface TtsCompanionSources {
  tokenizer: string;
  textEncoder: string;
  textEncoderData: string;
  latentDenoiser: string;
  latentDenoiserData: string;
  voiceDecoder: string;
  voiceDecoderData: string;
  voiceStyle: string;
}

export interface TtsLocalPaths {
  tokenizerPath: string;
  textEncoderPath: string;
  latentDenoiserPath: string;
  voiceDecoderPath: string;
  voiceStylePath: string;
}

const TTS_CACHE_SUBDIR = 'supertonic_http';
const USER_AGENT = 'qvac-sdk';

function urlToFilename(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] ?? 'unknown';
}

async function downloadOne(
  fs: IFileSystem,
  entry: DownloadEntry,
  dir: string,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<string> {
  const dest = `${dir}${entry.filename}`;
  const info = await fs.getInfo(dest);
  const minValid = AppConfig.models.minValidFileSizeBytes;

  // Skip if already cached and plausibly complete.
  if (info.exists && !info.isDirectory && info.size >= minValid) {
    if (entry.expectedBytes && info.size === entry.expectedBytes) {
      onProgress?.(entry.expectedBytes, entry.expectedBytes);
      return dest;
    }
    if (!entry.expectedBytes && info.size > 1024) {
      onProgress?.(info.size, info.size);
      return dest;
    }
  }

  return fs.download(entry.url, dest, {
    headers: { 'User-Agent': USER_AGENT },
    onProgress: onProgress
      ? ({ bytesWritten, bytesExpected }) => onProgress(bytesWritten, bytesExpected)
      : undefined,
  });
}

/**
 * Downloads all Supertonic TTS files (including `.onnx_data` companions) into a
 * dedicated cache directory with original filenames. Returns local paths that
 * can be passed directly to `loadModel` (the SDK accepts absolute paths).
 */
export async function downloadTtsWithCompanions(
  fs: IFileSystem,
  sources: TtsCompanionSources,
  onProgress?: (p: ModelProgressUpdate) => void,
): Promise<TtsLocalPaths> {
  const dir = `${fs.documentDirectory}${AppConfig.models.directoryName}/${TTS_CACHE_SUBDIR}/`;
  await fs.makeDirectory(dir, { intermediates: true });

  const entries: DownloadEntry[] = [
    { url: sources.tokenizer, filename: urlToFilename(sources.tokenizer) },
    { url: sources.textEncoder, filename: urlToFilename(sources.textEncoder) },
    { url: sources.textEncoderData, filename: urlToFilename(sources.textEncoderData) },
    { url: sources.latentDenoiser, filename: urlToFilename(sources.latentDenoiser) },
    { url: sources.latentDenoiserData, filename: urlToFilename(sources.latentDenoiserData) },
    { url: sources.voiceDecoder, filename: urlToFilename(sources.voiceDecoder) },
    { url: sources.voiceDecoderData, filename: urlToFilename(sources.voiceDecoderData) },
    { url: sources.voiceStyle, filename: urlToFilename(sources.voiceStyle) },
  ];

  let totalDownloaded = 0;
  let totalExpected = 0;

  // Sequential to avoid saturating mobile bandwidth.
  for (const entry of entries) {
    await downloadOne(fs, entry, dir, (downloaded, total) => {
      if (onProgress) {
        const runningDownloaded = totalDownloaded + downloaded;
        const runningTotal = totalExpected + total;
        onProgress({
          type: 'modelProgress',
          downloaded: runningDownloaded,
          total: runningTotal,
          percentage: runningTotal > 0
            ? Math.round((runningDownloaded / runningTotal) * 100)
            : 0,
          downloadKey: 'supertonic-http',
        });
      }
    });
    const info = await fs.getInfo(`${dir}${entry.filename}`);
    totalDownloaded += info.size;
    totalExpected += info.size;
  }

  // Supertonic resolves `voicesDir` as `dirname(voicePath)`, so the voice file
  // must live in a dedicated `voices/` sub-directory — move it there once.
  const voicesDir = `${dir}voices/`;
  await fs.makeDirectory(voicesDir, { intermediates: true });
  const voiceFilename = urlToFilename(sources.voiceStyle);
  const voiceDest = `${voicesDir}${voiceFilename}`;
  const voiceSrc = `${dir}${voiceFilename}`;
  const voiceDestInfo = await fs.getInfo(voiceDest);
  if (!voiceDestInfo.exists) {
    const srcInfo = await fs.getInfo(voiceSrc);
    if (srcInfo.exists) {
      await fs.move({ from: voiceSrc, to: voiceDest });
    }
  }

  return {
    tokenizerPath: `${dir}${urlToFilename(sources.tokenizer)}`,
    textEncoderPath: `${dir}${urlToFilename(sources.textEncoder)}`,
    latentDenoiserPath: `${dir}${urlToFilename(sources.latentDenoiser)}`,
    voiceDecoderPath: `${dir}${urlToFilename(sources.voiceDecoder)}`,
    voiceStylePath: voiceDest,
  };
}
