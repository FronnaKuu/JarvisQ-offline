// ---- Core Ports (re-exports) ---------------------------------------------
// Only abstractions that genuinely vary between platforms AND share consumer
// code (the pipeline) belong here. Everything else uses platform APIs directly.

export type { IAudioRecorder, RecordingResult, AudioRecorderCallbacks, AudioRecorderState } from './IAudioRecorder';
export type { IAudioPlayer } from './IAudioPlayer';
export type { ISttService, ILlmService, ITtsService, ConversationMessage, ProgressCallback } from '../inference/types';
