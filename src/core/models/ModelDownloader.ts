// ─── Model Downloader ─────────────────────────────────────────────────────────
// Downloads model files with resume support and progress callbacks.

import * as FileSystem from 'expo-file-system/legacy';
import type { DownloadProgress } from '@domain/types';
import {
  ensureModelsDirExists,
  getModelPath,
  getModelDirPath,
  modelFileExists,
} from './ModelStorage';

export interface DownloadTask {
  filename: string;
  url: string;
  expectedSizeBytes: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export async function downloadModelFile(
  task: DownloadTask,
  onProgress?: ProgressCallback,
): Promise<string> {
  await ensureModelsDirExists();

  if (await modelFileExists(task.filename)) {
    return getModelPath(task.filename);
  }

  const destPath = getModelPath(task.filename);
  const partialPath = `${destPath}.partial`;

  const partialInfo = await FileSystem.getInfoAsync(partialPath);
  const resumeOffset = partialInfo.exists ? (partialInfo.size ?? 0) : 0;

  const downloadResumable = FileSystem.createDownloadResumable(
    task.url,
    partialPath,
    {
      headers:
        resumeOffset > 0 ? { Range: `bytes=${resumeOffset}-` } : undefined,
    },
    (downloadProgressEvent) => {
      const downloaded =
        resumeOffset + downloadProgressEvent.totalBytesWritten;
      const total =
        downloadProgressEvent.totalBytesExpectedToWrite > 0
          ? resumeOffset + downloadProgressEvent.totalBytesExpectedToWrite
          : task.expectedSizeBytes;
      onProgress?.({
        bytesDownloaded: downloaded,
        totalBytes: total,
        percentage: total > 0 ? (downloaded / total) * 100 : 0,
        currentFile: task.filename,
      });
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) {
    throw new Error(`Download failed for ${task.filename}`);
  }

  await FileSystem.moveAsync({ from: partialPath, to: destPath });
  return destPath;
}

export async function downloadModelFiles(
  tasks: DownloadTask[],
  onProgress?: ProgressCallback,
): Promise<string[]> {
  const paths: string[] = [];
  let completedBytes = 0;
  const totalBytes = tasks.reduce((s, t) => s + t.expectedSizeBytes, 0);

  for (const task of tasks) {
    const path = await downloadModelFile(task, (p) => {
      onProgress?.({
        ...p,
        bytesDownloaded: completedBytes + p.bytesDownloaded,
        totalBytes,
        percentage: totalBytes > 0
          ? ((completedBytes + p.bytesDownloaded) / totalBytes) * 100
          : 0,
      });
    });
    completedBytes += task.expectedSizeBytes;
    paths.push(path);
  }
  return paths;
}

export async function downloadModelDir(
  subdirectory: string,
  tasks: DownloadTask[],
  onProgress?: ProgressCallback,
): Promise<string> {
  const dirPath = getModelDirPath(subdirectory);
  const dirInfo = await FileSystem.getInfoAsync(dirPath);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  }

  for (const task of tasks) {
    const filePath = `${dirPath}${task.filename}`;

    // Create subdirectory for paths like 'onnx/text_encoder.onnx'
    const slashIdx = task.filename.lastIndexOf('/');
    if (slashIdx !== -1) {
      const subDir = `${dirPath}${task.filename.substring(0, slashIdx)}/`;
      const subDirInfo = await FileSystem.getInfoAsync(subDir);
      if (!subDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(subDir, { intermediates: true });
      }
    }

    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists && (fileInfo.size ?? 0) >= task.expectedSizeBytes * 0.95) {
      continue;
    }

    const partialPath = `${filePath}.partial`;
    const partialInfo = await FileSystem.getInfoAsync(partialPath);
    const resumeOffset = partialInfo.exists ? (partialInfo.size ?? 0) : 0;

    const dlResumable = FileSystem.createDownloadResumable(
      task.url,
      partialPath,
      {
        headers:
          resumeOffset > 0 ? { Range: `bytes=${resumeOffset}-` } : undefined,
      },
      (e) => {
        const downloaded = resumeOffset + e.totalBytesWritten;
        const total = resumeOffset + e.totalBytesExpectedToWrite;
        onProgress?.({
          bytesDownloaded: downloaded,
          totalBytes: total,
          percentage: total > 0 ? (downloaded / total) * 100 : 0,
          currentFile: task.filename,
        });
      },
    );

    const result = await dlResumable.downloadAsync();
    if (!result?.uri) throw new Error(`Download failed for ${task.filename}`);
    await FileSystem.moveAsync({ from: partialPath, to: filePath });
  }

  return dirPath;
}
