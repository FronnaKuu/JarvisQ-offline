// ─── QVAC Bare Worklet ────────────────────────────────────────────────────────
// Runs inside the Bare runtime (react-native-bare-kit).
// Communicates with the React Native UI thread via IPC messages.
// All qvac inference (STT, LLM, TTS) runs here.

'use strict';

const { IPC } = BareKit;

// ─── Message Protocol ─────────────────────────────────────────────────────────
// Commands sent from RN → Worklet: { cmd, id, payload }
// Events sent from Worklet → RN:   { evt, id, payload }

function send(evt, id, payload) {
  const msg = JSON.stringify({ evt, id, payload });
  IPC.write(Buffer.from(msg));
}

function sendError(id, error) {
  send('error', id, { message: error instanceof Error ? error.message : String(error) });
}

// ─── State ────────────────────────────────────────────────────────────────────

let sttModel = null;
let sttLoader = null;

let llmModel = null;
let llmLoader = null;
let llmActiveResponse = null;

let ttsModel = null;
let ttsLoader = null;

// ─── STT ──────────────────────────────────────────────────────────────────────

async function handleSttLoad(id, payload) {
  try {
    const { FileSystemDataLoader } = require('@qvac/dl-filesystem');
    const { TranscriptionWhispercpp } = require('@qvac/transcription-whispercpp');

    if (sttModel) {
      await sttModel.unload();
      sttModel = null;
    }
    if (sttLoader) {
      await sttLoader.close();
      sttLoader = null;
    }

    sttLoader = new FileSystemDataLoader({ logger: console });

    sttModel = new TranscriptionWhispercpp(
      {
        loader: sttLoader,
        logger: console,
        cache: payload.cacheDir,
        model: payload.modelPath,
      },
      {
        language: payload.language ?? 'en',
        n_threads: payload.nThreads ?? 2,
        suppress_nst: true,
        ...(payload.vadModelPath
          ? {
              vad_model_path: payload.vadModelPath,
              vad_threshold: payload.vadThreshold ?? 0.5,
              vad_min_speech_duration_ms: payload.vadMinSpeechDurationMs ?? 100,
              vad_min_silence_duration_ms: payload.vadMinSilenceDurationMs ?? 300,
            }
          : {}),
      },
    );

    await sttModel.load((progress) => {
      send('stt:load:progress', id, { progress });
    });

    send('stt:load:done', id, {});
  } catch (err) {
    sendError(id, err);
  }
}

async function handleSttTranscribe(id, payload) {
  if (!sttModel) {
    sendError(id, 'STT model not loaded');
    return;
  }
  try {
    // payload.pcm is a base64-encoded Float32Array (16kHz mono)
    const buf = Buffer.from(payload.pcm, 'base64');
    const float32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

    const response = sttModel.run(float32);

    response.onUpdate((segment) => {
      send('stt:segment', id, { text: segment.text, isFinal: false });
    });

    await response.await();
    const result = await response;
    send('stt:result', id, { text: result.text ?? '', isFinal: true });
  } catch (err) {
    sendError(id, err);
  }
}

async function handleSttUnload(id) {
  try {
    if (sttModel) {
      await sttModel.unload();
      sttModel = null;
    }
    if (sttLoader) {
      await sttLoader.close();
      sttLoader = null;
    }
    send('stt:unload:done', id, {});
  } catch (err) {
    sendError(id, err);
  }
}

// ─── LLM ──────────────────────────────────────────────────────────────────────

async function handleLlmLoad(id, payload) {
  try {
    const { FileSystemDataLoader } = require('@qvac/dl-filesystem');
    const LlmLlamacpp = require('@qvac/llm-llamacpp');

    if (llmModel) {
      await llmModel.unload();
      llmModel = null;
    }
    if (llmLoader) {
      await llmLoader.close();
      llmLoader = null;
    }

    llmLoader = new FileSystemDataLoader({ logger: console });

    llmModel = new LlmLlamacpp(
      {
        loader: llmLoader,
        logger: console,
        cache: payload.cacheDir,
        model: payload.modelPath,
      },
      {
        device: payload.useGpu !== false ? 'gpu' : 'cpu',
        gpu_layers: String(payload.gpuLayers ?? 99),
        ctx_size: String(payload.contextSize ?? 2048),
        temp: String(payload.temperature ?? 0.7),
        top_p: String(payload.topP ?? 0.9),
        predict: String(payload.maxTokens ?? 256),
      },
    );

    await llmModel.load(false, (progress) => {
      send('llm:load:progress', id, { progress });
    });

    send('llm:load:done', id, {});
  } catch (err) {
    sendError(id, err);
  }
}

async function handleLlmGenerate(id, payload) {
  if (!llmModel) {
    sendError(id, 'LLM model not loaded');
    return;
  }
  try {
    if (llmActiveResponse) {
      llmActiveResponse.cancel();
      llmActiveResponse = null;
    }

    const messages = payload.messages; // [{role, content}]
    const response = await llmModel.run(messages);
    llmActiveResponse = response;

    response.onUpdate((token) => {
      send('llm:token', id, { token });
    });

    await response.await();
    llmActiveResponse = null;
    send('llm:done', id, {});
  } catch (err) {
    llmActiveResponse = null;
    sendError(id, err);
  }
}

async function handleLlmCancel(id) {
  if (llmActiveResponse) {
    llmActiveResponse.cancel();
    llmActiveResponse = null;
  }
  send('llm:cancelled', id, {});
}

async function handleLlmUnload(id) {
  try {
    if (llmActiveResponse) {
      llmActiveResponse.cancel();
      llmActiveResponse = null;
    }
    if (llmModel) {
      await llmModel.unload();
      llmModel = null;
    }
    if (llmLoader) {
      await llmLoader.close();
      llmLoader = null;
    }
    send('llm:unload:done', id, {});
  } catch (err) {
    sendError(id, err);
  }
}

// ─── TTS ──────────────────────────────────────────────────────────────────────

async function handleTtsLoad(id, payload) {
  try {
    const { FileSystemDataLoader } = require('@qvac/dl-filesystem');
    const ONNXTTS = require('@qvac/tts-onnx');

    if (ttsModel) {
      await ttsModel.unload();
      ttsModel = null;
    }
    if (ttsLoader) {
      await ttsLoader.close();
      ttsLoader = null;
    }

    ttsLoader = new FileSystemDataLoader({ logger: console });

    // Supertonic engine
    ttsModel = new ONNXTTS(
      {
        loader: ttsLoader,
        logger: console,
        cache: payload.cacheDir,
        modelDir: payload.modelDir,
        voiceName: payload.voiceName ?? 'F1',
        speed: payload.speed ?? 1.0,
        numInferenceSteps: payload.numInferenceSteps ?? 5,
      },
      {
        language: payload.language ?? 'en',
        useGPU: payload.useGpu !== false,
      },
    );

    await ttsModel.load((progress) => {
      send('tts:load:progress', id, { progress });
    });

    send('tts:load:done', id, {});
  } catch (err) {
    sendError(id, err);
  }
}

async function handleTtsSpeak(id, payload) {
  if (!ttsModel) {
    sendError(id, 'TTS model not loaded');
    return;
  }
  try {
    const response = ttsModel.run({ input: payload.text, type: 'text' });

    response.onUpdate((chunk) => {
      // chunk is Float32Array — encode as base64 for IPC transport
      const buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      send('tts:audio', id, {
        pcm: buf.toString('base64'),
        sampleRate: payload.sampleRate ?? 44100,
      });
    });

    await response.await();
    send('tts:done', id, {});
  } catch (err) {
    sendError(id, err);
  }
}

async function handleTtsUnload(id) {
  try {
    if (ttsModel) {
      await ttsModel.unload();
      ttsModel = null;
    }
    if (ttsLoader) {
      await ttsLoader.close();
      ttsLoader = null;
    }
    send('tts:unload:done', id, {});
  } catch (err) {
    sendError(id, err);
  }
}

// ─── Command Dispatcher ───────────────────────────────────────────────────────

const handlers = {
  'stt:load': handleSttLoad,
  'stt:transcribe': handleSttTranscribe,
  'stt:unload': handleSttUnload,
  'llm:load': handleLlmLoad,
  'llm:generate': handleLlmGenerate,
  'llm:cancel': handleLlmCancel,
  'llm:unload': handleLlmUnload,
  'tts:load': handleTtsLoad,
  'tts:speak': handleTtsSpeak,
  'tts:unload': handleTtsUnload,
};

let buffer = '';

IPC.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const { cmd, id, payload } = JSON.parse(line);
      const handler = handlers[cmd];
      if (handler) {
        handler(id, payload).catch((err) => sendError(id, err));
      } else {
        sendError(id, `Unknown command: ${cmd}`);
      }
    } catch (err) {
      console.error('Worklet parse error:', err);
    }
  }
});

send('ready', 'init', {});
