# QVAC parakeet streaming patches

Five-patch series that adds Silero-VAD simulated streaming to
`@qvac/transcription-parakeet` + `@qvac/sdk`, mid-segment partial
decoding on top for live-dictation UX, the matching CHANGELOG /
version bumps, both C++ unit and JS integration tests for the new
streaming surface, and a follow-up fix that makes the partial branch
actually fire mid-utterance.

The patches are exported with `git format-patch` from a clone of
[tetherto/qvac](https://github.com/tetherto/qvac) sitting two commits
ahead of `origin/main`. Apply them in order with `git am`.

> **Base**: this series was generated against upstream commit
> `5836c618` (the `tetherto/qvac@main` tip at the time of the build).
> Upstream has moved since; before submitting, rebase the local clone
> onto current `main` and resolve any conflicts (the most likely
> drift point is `packages/sdk/server/bare/plugins/parakeet-transcription/plugin.ts`,
> which sees frequent unrelated edits upstream). Re-export with
> `git format-patch` after the rebase to refresh these files.

## Patch series

### `0001-feat-parakeet-Silero-VAD-simulated-streaming-parity-.patch`
- **New C++**: `SileroVad` (ONNX session wrapping `silero_vad.onnx`) and
  `StreamingProcessor` (VAD-driven thread that segments live PCM and
  feeds each segment to `ParakeetModel::process`). Mirrors
  `qvac-lib-infer-whispercpp/addon/src/model-interface/StreamingProcessor.*`.
- **New native bindings**: `startStreaming` / `appendStreamingAudio` /
  `endStreaming`, exported from `binding.cpp`.
- **JS wrapper** (`@qvac/transcription-parakeet`): adds
  `TranscriptionParakeet.runStreaming(audioStream)` that drives the new
  native session.
- **SDK plugin** (`@qvac/sdk`): `parakeetConfigSchema` gains
  `vadModelSrc` + `vad_params`; the plugin's `resolveConfig` resolves
  the Silero model path; a `transcribeStream` duplex handler routes
  live PCM via the `transcribeStream` op into `model.runStreaming`.

### `0002-feat-parakeet-sdk-mid-segment-partial-decoding-for-l.patch`
- **C++**: `StreamingProcessor` re-runs the Parakeet recognizer on the
  in-progress (still-open) VAD segment every
  `partialDecodeIntervalSamples` (default 1.5 s) and emits the result
  with `isPartial=true`. The next final commit at the VAD endpoint
  replaces it. `ParakeetTypes::Transcript` gains an `isPartial` flag
  serialized through the addon output queue.
- **JS wrapper**: `vad_params.partial_decode_interval_ms` is plumbed
  through `runStreaming` into the native `startStreaming` config.
- **SDK schemas**: `transcribeStreamResponseSchema.isPartial?: boolean`
  and `vadParamsSchema.partial_decode_interval_ms?: number`.
- **SDK ops/handler/client**: `transcribeStream` yields
  `{text, isPartial}`; the parakeet plugin handler and the client-side
  `parseResponseLines` propagate the flag end-to-end.

Both feature patches are backwards-compatible: callers that don't set
`vadModelSrc` keep the legacy `transcribe()` flow; callers that set
`vadModelSrc` but not `partial_decode_interval_ms` get final-only
streaming.

### `0003-chore-release-parakeet-0.4.0-sdk-0.10.0-for-streamin.patch`
- Bumps `@qvac/transcription-parakeet` `0.3.2` → `0.4.0` and
  `@qvac/sdk` `0.9.1` → `0.10.0` (additive minor bumps, semver-correct
  for new public API).
- Adds CHANGELOG entries: parakeet uses the existing Keep-a-Changelog
  format; the SDK gets a per-version directory under `changelog/0.10.0/`
  with both `CHANGELOG.md` and `CHANGELOG_LLM.md` fragments, mirroring
  how `0.9.1` is structured.
- Bumps the SDK peer range to `@qvac/transcription-parakeet ^0.4.0`
  (the new streaming entrypoints live there).

### `0004-test-parakeet-integration-C-unit-tests-for-VAD-strea.patch`
- **C++ unit tests** at
  `packages/qvac-lib-infer-parakeet/addon/tests/StreamingProcessorTest.cpp`,
  wired into the existing `parakeet_tests` GoogleTest target via
  `CMakeLists.txt`. Header-only — no model files required:
  - `Transcript` defaults (`isPartial=false` on both constructors),
  - `StreamingProcessor::Config` public defaults (sample rate, VAD
    thresholds, derived sample-domain values, partial-decode cadence),
  - partial-decode opt-out (`partialDecodeIntervalSamples=0`),
  - override preservation.
- **JS integration suite** at
  `packages/qvac-lib-infer-parakeet/test/integration/vad-streaming-simulation.test.js`
  using `brittle`:
  - final-segment delivery and clean session shutdown,
  - mid-segment partial emission when `partial_decode_interval_ms` is set,
  - cancel re-entrancy (a second `runStreaming` after a cancelled job
    must not fail with "Streaming session already active").
- The integration suite skips cleanly when `silero_vad.onnx` or
  `sample.raw` are absent from the checkout, matching the
  conditional-skip pattern in `external-data-staging.test.js`.

### `0005-fix-parakeet-emit-open-VAD-segment-for-mid-segment-p.patch`
- **Bug fix**: 0002's mid-segment partial-decode branch was structurally
  unreachable because `SileroVad::getSegments()` only emits closed
  (silence-terminated or `maxSpeechFrames`-capped) segments — during
  ongoing speech it returns an empty vector, so 0002's
  `!segments.empty() && lastComplete < 0` guard never holds.
- **Fix** (single-file, +14 lines): `SileroVad::getSegments()` now
  appends a *preliminary* (open) segment at the end of the probability
  scan when `inSpeech` is still true. Patch 0002's existing
  `segmentStillOpen = lastT1S + marginS >= liveDurationS` check then
  evaluates true, the partial-decode branch fires every
  `partial_decode_interval_ms` (default 1.5 s) of new audio, and
  Parakeet emits `isPartial=true` transcripts that the consumer
  replaces with the next VAD-final commit.
- Verified end-to-end on OnePlus CPH2769: 30+ partial frames during a
  60 s dictation session, each progressively longer, replaced cleanly
  by finals at VAD endpoints. No regression in final-only mode
  (`partial_decode_interval_ms` unset) — the preliminary segment is
  only consulted by 0002's partial branch, which short-circuits when
  `partialDecodeIntervalSamples == 0`.

A pre-formatted PR body following the upstream `sdk-pod.md` template
ships alongside the patches as `PR-BODY.md`.

## How to apply and build

The native addon compiles against a clean clone of
[tetherto/qvac](https://github.com/tetherto/qvac) **on Linux** (the
parakeet addon's CMake invokes vcpkg for eigen / nlohmann-json /
onnxruntime, which needs clang + libc++ reliably only on Linux —
Windows cross-compile requires MSVC Build Tools and is not supported by
upstream tooling). On Windows, use WSL2.

```bash
# 1. Clone upstream and apply the series
git clone https://github.com/tetherto/qvac.git qvac-src
cd qvac-src
git am /path/to/0001-feat-parakeet-Silero-VAD-simulated-streaming-parity-.patch
git am /path/to/0002-feat-parakeet-sdk-mid-segment-partial-decoding-for-l.patch

# 2. Install monorepo deps for the parakeet package
cd packages/qvac-lib-infer-parakeet
npm install

# 3. Cross-compile for android-arm64 (other targets follow the same flow)
export VCPKG_ROOT=/path/to/vcpkg
export ANDROID_HOME=/path/to/Android/Sdk
bare-make generate --platform android --arch arm64
bare-make build
bare-make install
# produces: prebuilds/android-arm64/qvac__transcription-parakeet.bare

# 4. Drop the prebuild into the JarvisQVAC node_modules so expo prebuild picks it up
cp prebuilds/android-arm64/qvac__transcription-parakeet.bare \
   /path/to/JarvisQVAC/node_modules/@qvac/transcription-parakeet/prebuilds/android-arm64/

# 5. Rebuild the SDK package and overlay onto the app's node_modules
cd ../sdk
npm install && npm run build
cp -r dist/* /path/to/JarvisQVAC/node_modules/@qvac/sdk/dist/
# Or regenerate patches/@qvac+sdk+0.9.0.patch via patch-package once the
# node_modules content matches.
```

## Submitting upstream

Either of these works; pick whichever fits your workflow.

**Patch series via mailing list / PR attachment.** The two `.patch`
files in this directory are valid `git am` input and carry full author
metadata. Attach them to a GitHub PR description or send to the
upstream maintainers as-is.

**Standard fork-and-PR.** Push the same two commits to a fork of
`tetherto/qvac` and open a PR against `main`:

```bash
cd qvac-src
git remote add fork git@github.com:<your-user>/qvac.git
git push -u fork feat/parakeet-streaming
gh pr create --repo tetherto/qvac --base main \
  --title "feat(parakeet): Silero VAD streaming + mid-segment partials" \
  --body-file /path/to/PR-body.md
```

Recommended PR body content:

- Why Silero is opened as a separate `Ort::Session` instead of reusing
  whisper.cpp's built-in VAD (see *Design notes* below).
- Symmetry with `qvac-lib-infer-whispercpp/.../StreamingProcessor.*`.
- New public surface: `runStreaming`, the three native bindings, the
  `transcribeStream` op for parakeet, the `vadModelSrc` + `vad_params`
  schema fields, and `isPartial` on the duplex frame.
- Backward compatibility: every new field is optional; `run()` is
  untouched.
- Tested platforms: declare honestly. The reference build for this
  series is `android-arm64` cross-compiled from Linux x64 (WSL2). Other
  targets compile from the same source but should be validated by
  upstream CI.
- External model dependency: `silero_vad.onnx` (~2 MB), Silero v5
  upstream, MIT.

The split into two commits keeps base streaming (#0001) reviewable on
its own and lets reviewers gate the partial-decode feature (#0002)
separately if they prefer to land it in stages.

## Design notes

### Why Silero in parakeet instead of reusing whisper.cpp's

`whisper_vad_context` lives inside whisper.cpp's C API and is not linked
by the parakeet addon, which uses `@qvac/onnx` (ONNX Runtime) directly.
`SileroVad` opens a separate `Ort::Session` for `silero_vad.onnx`
(v5: 512-sample windows @ 16 kHz, LSTM state `[2,1,128]`) — no new
native dependency is added beyond what parakeet already links.

### Mid-segment partials vs final-only

Parakeet is an offline RNN-T recognizer; "true" streaming would require
a different model export. Simulated streaming gives per-VAD-segment
finals; the partial-decode loop (#0002) re-runs the recognizer on the
in-progress segment every ~1.5 s so callers get a live tail to render
in the UI. The native side tags each output with `isPartial`, so the
SDK consumer can replace-or-append correctly.
