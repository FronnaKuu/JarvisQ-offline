<!--
PR title (REQUIRED tags per sdk-pod.md template):
[api][mod] feat(sdk,parakeet): streaming transcription with Silero VAD

Body follows the upstream `.github/PULL_REQUEST_TEMPLATE/sdk-pod.md`
template, since the change spans both the parakeet addon and the SDK
plugin / op layer.
-->

## 🎯 What problem does this PR solve?

- Parakeet had no live-streaming transcription path — only one-shot `transcribe()`. Whisper has had simulated streaming (VAD-segmented + per-segment recognizer calls) for several releases. This is the symmetric capability for parakeet so the SDK plugin layer can treat the two engines the same way.
- The duplex `transcribeStream` op was Whisper-only. Parakeet model IDs were rejected at the plugin handler level, blocking any live-transcription UX (dictation, real-time captions) on parakeet-only deployments.
- For live-dictation UX the consumer needs in-flight, replaceable partial transcripts as the user speaks — not just per-segment finals at the VAD endpoint. Whisper streaming exposes this; parakeet did not.

## 📝 How does it solve it?

- **New native classes in `qvac-lib-infer-parakeet`**: `SileroVad` (dedicated `Ort::Session` wrapping `silero_vad.onnx` v5 — 512-sample windows @ 16 kHz, LSTM state `[2,1,128]`) and `StreamingProcessor` (background thread that segments live PCM with the VAD and dispatches each closed segment to `ParakeetModel::process`). One-to-one mirror of `qvac-lib-infer-whispercpp/.../StreamingProcessor.*`.
- **Three new native bindings** (`startStreaming`, `appendStreamingAudio`, `endStreaming`) and a JS-level `TranscriptionParakeet.runStreaming(audioStream)` that drives them.
- **Mid-segment partials** (#0002): while a VAD segment is still open, the recognizer is re-run on the in-progress range every `partialDecodeIntervalSamples` (default 1.5 s) and emitted with `isPartial=true`. The next final commit at the VAD endpoint replaces it. `ParakeetTypes::Transcript.isPartial` carries the flag through the addon output queue.
- **Open-segment exposure for the partial loop** (#0005): in the original `SileroVad::getSegments()` implementation, only segments that had been closed by silence or by the `maxSpeechFrames` cap were returned. During on-going speech the function returned an empty vector, which made the partial-decode branch in #0002 — gated on `!segments.empty() && lastComplete < 0` — structurally unreachable mid-utterance. The fix appends a *preliminary* (open) segment when `inSpeech` is still true at the end of the probability scan, so #0002’s existing `segmentStillOpen = lastT1S + marginS >= liveDurationS` predicate evaluates true and the partial loop fires as designed. The closed-segment path is unchanged.
- **SDK glue**: `parakeetConfigSchema` accepts `vadModelSrc` + `vad_params`; `resolveConfig` resolves the Silero path orthogonally to the recognizer variant (TDT / CTC / sortformer) so it composes with all of them. The parakeet plugin now exports a `transcribeStream` duplex handler (`defineDuplexHandler`) that yields `{text, isPartial}`. `transcribeStreamResponseSchema.isPartial?: boolean` and the client `parseResponseLines` propagate the flag end-to-end.
- **Zero new native dependencies**: Silero ships as an `Ort::Session` reusing the `@qvac/onnx` runtime parakeet already links against. No vcpkg manifest or CMake target additions beyond two new `.cpp` files.

The series is split into five commits to keep review tractable:

1. `feat(parakeet): Silero VAD simulated streaming (parity with whisper)` — base streaming engine + plugin handler.
2. `feat(parakeet,sdk): mid-segment partial decoding for live streaming` — partial loop + `isPartial` propagation.
3. `chore(release): parakeet 0.4.0 + sdk 0.10.0 for streaming + partials` — version bumps and CHANGELOG entries (parakeet `CHANGELOG.md`, sdk `changelog/0.10.0/{CHANGELOG,CHANGELOG_LLM}.md` + aggregated top-level).
4. `test(parakeet): integration + C++ unit tests for VAD streaming` — three `brittle` integration tests under `test/integration/` plus a new `StreamingProcessorTest.cpp` (`Transcript` and `StreamingProcessor::Config` defaults) wired into the existing `parakeet_tests` GoogleTest target.
5. `fix(parakeet): emit open VAD segment so mid-segment partials can fire` — single-file change (+14 lines) in `SileroVad.cpp` that makes the partial branch from #0002 reachable on real-world utterances.

## 🧪 How was it tested?

- **Native build**: cross-compiled for `android-arm64` from Linux x64 via `bare-make generate --platform android --arch arm64 && bare-make build && bare-make install`. Other targets (linux-x64, darwin-arm64, win32-x64, ios-arm64) compile from the same sources but were not built locally — upstream CI workflows (`prebuilds-qvac-lib-infer-parakeet.yml`, `cpp-test-coverage-qvac-lib-infer-parakeet.yml`, `integration-mobile-test-qvac-lib-infer-parakeet.yml`) are expected to validate them on this PR.
- **Manual end-to-end** on a physical Android device (OnePlus CPH2769, arm64) inside an Expo / React Native app driving `transcribeStream({modelId})` with the parakeet TDT model + `silero_vad.onnx`. Verified:
  - Final segments arrive at VAD endpoints with sub-second latency from end-of-utterance.
  - With `partial_decode_interval_ms: 1500`, partials arrive every ~1.5 s while speaking and get replaced cleanly by the final at the endpoint. A 60 s dictation session produced 30+ partial frames spanning 14 final segments, each partial progressively revising the running transcript and being superseded by the corresponding VAD-endpoint final.
  - Without #0005 the partial branch never fires on natural utterances (verified by counting `isPartial=true` frames over multi-second continuous speech: 0). With #0005 the same input yields the cadence above. This was the regression that motivated #0005.
  - Cancel mid-utterance and immediate re-`runStreaming()` no longer fails with "Streaming session already active".
  - PCM chunks delivered with odd `byteOffset` (pear-rpc Buffer slices) no longer crash with "start offset of Int16Array should be a multiple of 2".
- **C++ unit tests** added under `packages/qvac-lib-infer-parakeet/addon/tests/StreamingProcessorTest.cpp`, registered in the existing `parakeet_tests` GoogleTest target. Header-only — no model files required, runs in any CI lane that already builds `parakeet_tests`. Covers `Transcript` and `StreamingProcessor::Config` public defaults, partial-decode opt-out, and override preservation.
- **JS integration tests** added under `packages/qvac-lib-infer-parakeet/test/integration/vad-streaming-simulation.test.js` (skip cleanly if `silero_vad.onnx` or `sample.raw` are missing from the local checkout, matching the conditional-skip pattern in `external-data-staging.test.js`).
- **Backwards-compat smoke**: existing `live-stream-simulation.test.js`, `accuracy-multilang.test.js`, and `multiple-transcriptions.test.js` exercise the unchanged `transcribe()` / EOU paths and continue to pass.

## 🔌 API Changes

```typescript
// 1. New SDK config: pass a VAD model source to enable streaming.
loadModel({
  modelType: "parakeet-transcription",
  config: {
    parakeetEncoderSrc: ENCODER,
    parakeetDecoderSrc: DECODER,
    parakeetPreprocessorSrc: PREPROCESSOR,
    parakeetVocabSrc: VOCAB,
    vadModelSrc: VAD_SILERO_5_1_2,           // NEW — activates streaming path
    vad_params: {                            // NEW — all fields optional
      threshold: 0.5,
      min_silence_duration_ms: 500,
      min_speech_duration_ms: 250,
      max_speech_duration_s: 30,
      speech_pad_ms: 30,
      samples_overlap: 0.1,
      partial_decode_interval_ms: 1500,      // 0 disables partials
    },
  },
});

// 2. Existing transcribeStream now accepts parakeet model IDs.
//    Iterator yields {text, isPartial?}: isPartial is parakeet-only.
import { transcribeStream } from "@qvac/sdk";

const session = await transcribeStream({ modelId });
for await (const pcmChunk of micPcm) session.write(pcmChunk);
session.end();

for await (const seg of session) {
  if (seg.isPartial) replaceRunningTail(seg.text);
  else commit(seg.text);
}

// 3. Lower-level addon API (for callers using @qvac/transcription-parakeet directly):
import TranscriptionParakeet from "@qvac/transcription-parakeet";

const model = new TranscriptionParakeet({
  files: { encoder, decoder, vocab, preprocessor, vadModel },
  config: { parakeetConfig: { modelType: "tdt", vad_params: { ... } } },
});
await model.load();
const response = await model.runStreaming(audioStream);   // NEW
```

All new fields are optional; callers that don’t set `vadModelSrc` keep the legacy `transcribe()` flow unchanged.

## 📦 Models

### Newly consumed by parakeet streaming

```
VAD_SILERO_5_1_2
```

No new model constants are added in this release. The constant already exists in the SDK model registry; parakeet streaming loads `silero_vad.onnx` (~2 MB, MIT, [snakers4/silero-vad](https://github.com/snakers4/silero-vad)) through it when `vadModelSrc` is set on the parakeet config. v5 with `[1, samples]` input shape, `[2, 1, 128]` LSTM state, fixed 512-sample windows at 16 kHz. Whisper streaming is unaffected — whisper continues to use its built-in `whisper_vad_context`.

## ✅ Compatibility checklist

- [x] No breaking changes to existing public APIs. Every new schema field is `optional`. `transcribe()`, the EOU streaming path, and the Sortformer path are untouched.
- [x] No new native dependencies — `SileroVad` reuses the ONNX Runtime already linked by parakeet via `@qvac/onnx`.
- [x] Backwards-compatible peer range bump in `@qvac/sdk` (`@qvac/transcription-parakeet ^0.3.1` → `^0.4.0`) reflecting the additive new entrypoints.
- [x] CHANGELOG entries added for both packages following the existing format.
- [x] C++ unit tests added under `addon/tests/` (header-only, no model files required) and JS integration tests under `test/integration/` (skip cleanly when optional artifacts are missing).
- [x] The #0005 fix is contained to a single function (`SileroVad::getSegments()`) and does not alter the public class surface, the segment data structure, or the behaviour observed by existing callers that only inspect closed segments. End-of-stream handling is unchanged because that path goes through the “force-process final buffer” code in `StreamingProcessor` and does not consult the segment list.

## 🏷️ Suggested labels

- `verify` — to trigger integration / benchmark / model validation jobs once a maintainer is comfortable.
- `nlp` — STT / ASR change.
- `safe-to-test` — required because this PR comes from an external fork.
