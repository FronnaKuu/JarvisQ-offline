// ─── Core Ports Barrel ───────────────────────────────────────────────────────
// Platform-agnostic abstractions consumed by the core layer. Adapters live in
// `src/platform/<target>/` and are wired up through the platform bootstrap.

export type {
  IAudioRecorder,
  RecordingResult,
  AudioRecorderCallbacks,
  AudioRecorderState,
} from './IAudioRecorder';
export type { IAudioPlayer } from './IAudioPlayer';
export type {
  IFileSystem,
  FileInfo,
  DownloadOptions,
  DownloadProgressEvent,
  DownloadProgressListener,
} from './IFileSystem';
export type { IKeyValueStore } from './IKeyValueStore';
export type {
  IDatabase,
  SqlParam,
  SqlRow,
} from './IDatabase';
export type {
  ISttService,
  ILlmService,
  ITtsService,
  ConversationMessage,
  ProgressCallback,
} from '../inference/types';
