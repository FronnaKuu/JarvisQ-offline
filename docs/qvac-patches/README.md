# QVAC parakeet streaming patches

Contains the C++/JS patches that add Silero-VAD simulated streaming to
`@qvac/transcription-parakeet` + `@qvac/sdk`, mirroring the whisper
streaming surface. See `0001-feat-parakeet-Silero-VAD-simulated-streaming-parity-.patch`.

## What the patch adds

- **New C++**: `SileroVad` (ONNX session wrapping silero_vad.onnx) and
  `StreamingProcessor` (VAD-driven thread that segments live PCM and
  feeds each segment to `ParakeetModel::process`). Mirrors
  `qvac-lib-infer-whispercpp/addon/src/model-interface/StreamingProcessor.*`.
- **New native bindings**: `startStreaming` / `appendStreamingAudio` /
  `endStreaming`, exported from `binding.cpp`.
- **JS wrapper** (`@qvac/transcription-parakeet`): adds
  `TranscriptionParakeet.runStreaming(audioStream)` that drives the new
  native session.
- **SDK plugin** (`@qvac/sdk`): `parakeetConfigSchema` gains
  `vadModelSrc` + `vad_params`; plugin's `resolveConfig` resolves
  the Silero model path; a `transcribeStream` duplex handler routes
  live PCM via `transcribeStream` op → `model.runStreaming`.

## How to build

The patch compiles against a clean clone of
[tetherto/qvac](https://github.com/tetherto/qvac) **on Linux** (the
parakeet addon CMake invokes vcpkg for eigen/nlohmann-json/onnxruntime,
which needs clang + libc++ reliably only on Linux — Windows cross-compile
requires MSVC Build Tools).

```bash
# 1. clone + apply
git clone https://github.com/tetherto/qvac.git qvac-src
cd qvac-src
git am /path/to/0001-feat-parakeet-Silero-VAD-simulated-streaming-parity-.patch

# 2. install monorepo deps
cd packages/qvac-lib-infer-parakeet
npm install

# 3. cross-compile for android-arm64
export VCPKG_ROOT=/path/to/vcpkg
export ANDROID_HOME=/path/to/Android/Sdk
bare-make generate --platform android --arch arm64
bare-make build
bare-make install
# produces: prebuilds/android-arm64/qvac__transcription-parakeet.bare

# 4. copy prebuild into the JarvisQVAC node_modules so expo prebuild picks it up
cp prebuilds/android-arm64/qvac__transcription-parakeet.bare \
   /path/to/JarvisQVAC/node_modules/@qvac/transcription-parakeet/prebuilds/android-arm64/

# 5. also rebuild the SDK dist (tsc) and copy dist/ → JarvisQVAC node_modules,
#    or regenerate patches/@qvac+sdk+0.9.0.patch via patch-package
```

## App-level integration (TODO, task #7)

- Add `silero_vad.onnx` (≈2 MB) to `HttpModelSources.ts` /
  `ModelConfig.ts`; wire it as `vadModelSrc` in the parakeet
  `SttLoadConfig`.
- Replace `ExpoAudioRecorder` with a PCM-streaming recorder (e.g.
  `react-native-audio-record` @ 16 kHz mono s16le) so the app can feed
  live chunks into `transcribeStream({modelId}).write(chunk)`.
- Add `transcribeLive(pcmStream, onPartial)` to `ISttService` and route
  `VoicePipeline` to it when engine=parakeet.

## Why Silero in parakeet instead of reusing whisper.cpp's

`whisper_vad_context` lives inside whisper.cpp's C API and is not
linked by the parakeet addon, which uses `@qvac/onnx` (ONNX Runtime)
directly. `SileroVad` opens a separate `Ort::Session` for
`silero_vad.onnx` (v5: 512-sample windows @ 16 kHz, LSTM state
[2,1,128]) — no new native dependency is added beyond what parakeet
already links.
