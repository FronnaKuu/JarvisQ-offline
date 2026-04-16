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

// ─── Supertonic TTS (onnx-community/Supertonic-TTS-ONNX) ────────────────────
// Supertonic ONNX models are split into .onnx (graph) + .onnx_data (weights).
// The SDK's default HTTP downloader saves files with hash prefixes, preventing
// ONNX Runtime from finding companion .onnx_data files. The HTTP fallback uses
// a custom downloader (downloadTtsWithCompanions) that places all files in the
// same directory with original filenames so ONNX Runtime can resolve them.

const TTS_REPO = 'onnx-community/Supertonic-TTS-ONNX';
const TTS_COMMIT = 'cff123c84b0655d9d647641f1b532c3cbb8f7faa';

export const SUPERTONIC_HTTP = {
  tokenizer: hfResolve(TTS_REPO, TTS_COMMIT, 'tokenizer.json'),
  textEncoder: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/text_encoder.onnx'),
  textEncoderData: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/text_encoder.onnx_data'),
  latentDenoiser: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/latent_denoiser.onnx'),
  latentDenoiserData: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/latent_denoiser.onnx_data'),
  voiceDecoder: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/voice_decoder.onnx'),
  voiceDecoderData: hfResolve(TTS_REPO, TTS_COMMIT, 'onnx/voice_decoder.onnx_data'),
  voiceStyle: hfResolve(TTS_REPO, TTS_COMMIT, 'voices/F1.bin'),
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
