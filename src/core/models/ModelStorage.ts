// ---- Model Storage -------------------------------------------------------
// Resolves model file paths on device storage.

import * as FileSystem from 'expo-file-system/legacy';
import { AppConfig } from '@core/config/AppConfig';

function modelsRoot(): string {
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error('documentDirectory is null');
  return `${base}${AppConfig.models.directoryName}/`;
}

export function getModelPath(filename: string): string {
  return `${modelsRoot()}${filename}`;
}

export function getModelDirPath(subdirectory: string): string {
  return `${modelsRoot()}${subdirectory}/`;
}

export async function ensureModelsDirExists(): Promise<void> {
  const dir = modelsRoot();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function modelFileExists(filename: string): Promise<boolean> {
  const path = getModelPath(filename);
  const info = await FileSystem.getInfoAsync(path);
  return (
    info.exists &&
    !info.isDirectory &&
    (info.size ?? 0) >= AppConfig.models.minValidFileSizeBytes
  );
}

export async function getModelFileSize(filename: string): Promise<number> {
  const path = getModelPath(filename);
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? (info.size ?? 0) : 0;
}
