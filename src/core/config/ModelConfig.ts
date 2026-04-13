// ─── Model Configuration ─────────────────────────────────────────────────────
// Describes all downloadable models: URLs, file names, sizes.
// No hardcoded paths — paths are resolved at runtime from the models directory.

export interface ModelFile {
  name: string;
  url: string;
  sizeBytes: number;
}

export interface SttModelConfig {
  id: string;
  label: string;
  files: ModelFile[];
  vadFile: ModelFile;
}

export interface LlmModelConfig {
  id: string;
  label: string;
  file: ModelFile;
}

export interface TtsModelConfig {
  id: string;
  label: string;
  engine: 'supertonic' | 'chatterbox';
  modelDir: string;
  files: ModelFile[];
}

// ─── STT Models ──────────────────────────────────────────────────────────────

const HF_WHISPER_BASE =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

const HF_SILERO_VAD =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-silero-v5.1.2.bin';

export const STT_MODELS: Record<string, SttModelConfig> = {
  whisper_base: {
    id: 'whisper_base',
    label: 'Whisper Base (148 MB)',
    files: [
      {
        name: 'ggml-base.bin',
        url: `${HF_WHISPER_BASE}/ggml-base.bin`,
        sizeBytes: 147_964_211,
      },
    ],
    vadFile: {
      name: 'ggml-silero-v5.1.2.bin',
      url: HF_SILERO_VAD,
      sizeBytes: 885_000,
    },
  },
  whisper_small: {
    id: 'whisper_small',
    label: 'Whisper Small (488 MB)',
    files: [
      {
        name: 'ggml-small.bin',
        url: `${HF_WHISPER_BASE}/ggml-small.bin`,
        sizeBytes: 487_601_171,
      },
    ],
    vadFile: {
      name: 'ggml-silero-v5.1.2.bin',
      url: HF_SILERO_VAD,
      sizeBytes: 885_000,
    },
  },
};

export const DEFAULT_STT_MODEL_ID = 'whisper_base';

// ─── LLM Models ──────────────────────────────────────────────────────────────

const HF_QWEN_BASE =
  'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main';

export const LLM_MODELS: Record<string, LlmModelConfig> = {
  qwen35_2b_iq4: {
    id: 'qwen35_2b_iq4',
    label: 'Qwen 3.5 2B IQ4 (~1.3 GB)',
    file: {
      name: 'Qwen3.5-2B-IQ4_NL.gguf',
      url: `${HF_QWEN_BASE}/Qwen3.5-2B-IQ4_NL.gguf`,
      sizeBytes: 1_306_525_696,
    },
  },
  qwen35_0_8b_q8: {
    id: 'qwen35_0_8b_q8',
    label: 'Qwen 3.5 0.8B Q8 (~870 MB)',
    file: {
      name: 'Qwen3.5-0.8B-Q8_0.gguf',
      url: `${HF_QWEN_BASE}/Qwen3.5-0.8B-Q8_0.gguf`,
      sizeBytes: 870_000_000,
    },
  },
};

export const DEFAULT_LLM_MODEL_ID = 'qwen35_2b_iq4';

// ─── TTS Models ──────────────────────────────────────────────────────────────
// Supertonic ONNX models from: https://huggingface.co/onnx-community/Supertonic-TTS-ONNX

const HF_SUPERTONIC_BASE =
  'https://huggingface.co/onnx-community/Supertonic-TTS-ONNX/resolve/main';

export const TTS_MODELS: Record<string, TtsModelConfig> = {
  supertonic_en: {
    id: 'supertonic_en',
    label: 'Supertonic English (~180 MB)',
    engine: 'supertonic',
    modelDir: 'supertonic_en',
    files: [
      // Tokenizer
      {
        name: 'tokenizer.json',
        url: `${HF_SUPERTONIC_BASE}/tokenizer.json`,
        sizeBytes: 1_400_000,
      },
      // ONNX models (in onnx/ subdirectory — downloaded flat into modelDir)
      {
        name: 'onnx/text_encoder.onnx',
        url: `${HF_SUPERTONIC_BASE}/onnx/text_encoder.onnx`,
        sizeBytes: 40_000_000,
      },
      {
        name: 'onnx/text_encoder.onnx_data',
        url: `${HF_SUPERTONIC_BASE}/onnx/text_encoder.onnx_data`,
        sizeBytes: 10_000_000,
      },
      {
        name: 'onnx/latent_denoiser.onnx',
        url: `${HF_SUPERTONIC_BASE}/onnx/latent_denoiser.onnx`,
        sizeBytes: 70_000_000,
      },
      {
        name: 'onnx/latent_denoiser.onnx_data',
        url: `${HF_SUPERTONIC_BASE}/onnx/latent_denoiser.onnx_data`,
        sizeBytes: 20_000_000,
      },
      {
        name: 'onnx/voice_decoder.onnx',
        url: `${HF_SUPERTONIC_BASE}/onnx/voice_decoder.onnx`,
        sizeBytes: 35_000_000,
      },
      {
        name: 'onnx/voice_decoder.onnx_data',
        url: `${HF_SUPERTONIC_BASE}/onnx/voice_decoder.onnx_data`,
        sizeBytes: 5_000_000,
      },
      // Default voice preset (F1 = female)
      {
        name: 'voices/F1.bin',
        url: `${HF_SUPERTONIC_BASE}/voices/F1.bin`,
        sizeBytes: 500_000,
      },
      {
        name: 'voices/M1.bin',
        url: `${HF_SUPERTONIC_BASE}/voices/M1.bin`,
        sizeBytes: 500_000,
      },
    ],
  },
};

export const DEFAULT_TTS_MODEL_ID = 'supertonic_en';
