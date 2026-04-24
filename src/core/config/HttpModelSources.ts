// ─── HTTP Model Sources ──────────────────────────────────────────────────────
// HuggingFace HTTPS fallback URLs for all models. Used when the QVAC P2P
// registry (Hyperswarm) is unavailable or the target blob core has no active
// peers. Each entry pins a specific commit SHA so downloads are reproducible.

// ─── Base URLs ───────────────────────────────────────────────────────────────

const HF_BASE = 'https://huggingface.co';

function hfResolve(repo: string, commit: string, path: string): string {
  return `${HF_BASE}/${repo}/resolve/${commit}/${path}`;
}

// ─── Parakeet TDT 0.6B v3 (istupakov/parakeet-tdt-0.6b-v3-onnx) ────────────

const PARAKEET_REPO = 'istupakov/parakeet-tdt-0.6b-v3-onnx';
const PARAKEET_COMMIT = 'abd2878d52a678ce380088ef9d9b1d9664404565';

export const PARAKEET_HTTP = {
  encoderInt8: hfResolve(PARAKEET_REPO, PARAKEET_COMMIT, 'encoder-model.int8.onnx'),
  decoderInt8: hfResolve(PARAKEET_REPO, PARAKEET_COMMIT, 'decoder_joint-model.int8.onnx'),
  encoderFp32: hfResolve(PARAKEET_REPO, PARAKEET_COMMIT, 'encoder-model.onnx'),
  encoderDataFp32: hfResolve(PARAKEET_REPO, PARAKEET_COMMIT, 'encoder-model.onnx.data'),
  decoderFp32: hfResolve(PARAKEET_REPO, PARAKEET_COMMIT, 'decoder_joint-model.onnx'),
  preprocessor: hfResolve(PARAKEET_REPO, PARAKEET_COMMIT, 'nemo128.onnx'),
  vocab: hfResolve(PARAKEET_REPO, PARAKEET_COMMIT, 'vocab.txt'),
} as const;

// ─── Silero VAD v5.1.2 (snakers4/silero-vad) ─────────────────────────────
// Used by parakeet streaming (transcribeStream duplex) to segment live PCM
// before invoking the offline recognizer on each detected speech segment.
// ~2 MB ONNX (plain protobuf, NOT the ggml-wrapped variant that QVAC's
// VAD_SILERO_5_1_2 registry entry serves — that one fails to load via
// Ort::Session with "Protobuf parsing failed"). Points at the canonical
// snakers4/silero-vad v5.1.2 tag on GitHub: the model inputs are
// [input, state (2,1,128), sr] which matches SileroVad.cpp.

export const SILERO_VAD_HTTP = {
  vad: 'https://github.com/snakers4/silero-vad/raw/v5.1.2/src/silero_vad/data/silero_vad.onnx',
} as const;

// ─── Qwen3 1.7B (unsloth/Qwen3-1.7B-GGUF) ──────────────────────────────────

const QWEN3_1_7B_REPO = 'unsloth/Qwen3-1.7B-GGUF';
const QWEN3_1_7B_COMMIT = 'd7f544eead698dbd1f15126ef60b45a1e1933222';

export const QWEN3_HTTP = {
  q4: hfResolve(QWEN3_1_7B_REPO, QWEN3_1_7B_COMMIT, 'Qwen3-1.7B-Q4_0.gguf'),
} as const;

// ─── Qwen3 4B (Qwen/Qwen3-4B-GGUF — lookup commit at runtime if needed) ────

const QWEN3_4B_REPO = 'Qwen/Qwen3-4B-GGUF';
const QWEN3_4B_COMMIT = 'main'; // pinned to branch; no specific commit available

export const QWEN3_4B_HTTP = {
  q4km: hfResolve(QWEN3_4B_REPO, QWEN3_4B_COMMIT, 'qwen3-4b-q4_k_m.gguf'),
} as const;

// ─── Supertonic 2 TTS (Supertone/supertonic-2) ─────────────────────────────
// Supertonic 2 ships each component as a standalone .onnx/.json file — no
// .onnx_data companion weights — so the SDK's built-in HTTP downloader can
// fetch them directly (no custom filename preservation needed).

const TTS_REPO = 'Supertone/supertonic-2';
const TTS_COMMIT = '75e6727618a02f323c720cba9478152d4bc16ca4';

export const SUPERTONIC_HTTP = {
  textEncoder: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/text_encoder.onnx'),
  durationPredictor: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/duration_predictor.onnx'),
  vectorEstimator: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/vector_estimator.onnx'),
  vocoder: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/vocoder.onnx'),
  unicodeIndexer: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/unicode_indexer.json'),
  ttsConfig: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/tts.json'),
  voiceStyle: hfResolve(TTS_REPO, TTS_COMMIT, 'voice_styles/F1.json'),
} as const;

// ─── Whisper (ggerganov/whisper.cpp) ─────────────────────────────────────────

const WHISPER_REPO = 'ggerganov/whisper.cpp';
const WHISPER_COMMIT = '5359861c739e955e79d9a303bcbc70fb988958b1';

export const WHISPER_HTTP = {
  tinyQ8: hfResolve(WHISPER_REPO, WHISPER_COMMIT, 'ggml-tiny-q8_0.bin'),
  baseQ8: hfResolve(WHISPER_REPO, WHISPER_COMMIT, 'ggml-base-q8_0.bin'),
  smallQ8: hfResolve(WHISPER_REPO, WHISPER_COMMIT, 'ggml-small-q8_0.bin'),
  largeV3Turbo: hfResolve(WHISPER_REPO, WHISPER_COMMIT, 'ggml-large-v3-turbo.bin'),
} as const;
