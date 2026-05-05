# Provenance — patched parakeet streaming prebuild

This document traces the chain of custody for the patched
`@qvac/transcription-parakeet` android-arm64 native binding shipped
inside the JarvisQ Android APK. It is intended to make the build
auditable end-to-end for any reviewer.

## Why a patched prebuild

Streaming dictation in the app uses the `transcribeStream` duplex
session, which depends on a Silero VAD-driven streaming pipeline added
to `@qvac/transcription-parakeet` and `@qvac/sdk`. The implementation
lives in the patch series under `docs/qvac-patches/` and adds three
native bindings (`startStreaming`, `appendStreamingAudio`,
`endStreaming`), the C++ `SileroVad` and `StreamingProcessor` classes,
and the surrounding JS / SDK plumbing.

The published `@qvac/transcription-parakeet` npm package is a stock
build that does not yet include these native symbols. Loading the JS
patch from `patches/@qvac+transcription-parakeet+0.3.1.patch` against
the stock native module fails at runtime with:

```
TRANSCRIPTION_FAILED: this._binding.startStreaming is not a function
```

To resolve this, the JarvisQ release pipeline overlays a patched
android-arm64 prebuild built from a public fork of the QVAC monorepo
that carries the patch series.

## Patch series

The patch series is reproduced in this repository under
`docs/qvac-patches/`:

- `0001-feat-parakeet-Silero-VAD-simulated-streaming-parity-.patch`
- `0002-feat-parakeet-sdk-mid-segment-partial-decoding-for-l.patch`
- `0003-chore-release-parakeet-0.4.0-sdk-0.10.0-for-streamin.patch`
- `0004-test-parakeet-integration-C-unit-tests-for-VAD-strea.patch`
- `0005-fix-parakeet-emit-open-VAD-segment-for-mid-segment-p.patch`

The series base is upstream commit `5836c618` of `tetherto/qvac`. See
`docs/qvac-patches/README.md` for the design notes, applied build
procedure, and intended upstream submission path.

## Fork and tag

| Field | Value |
|---|---|
| Fork repository | https://github.com/Helldez/qvac |
| Fork branch | `feat/parakeet-streaming-silero-vad` |
| Upstream base commit | `5836c618` (`tetherto/qvac@main` at branch creation) |
| Patch commits on the branch | `b05e046c`, `8195154a`, `22c5d8f9`, `4f0a5b16`, `6278b076`, `1a009f88` |
| Release tag | `parakeet-streaming-1` |
| Release URL | https://github.com/Helldez/qvac/releases/tag/parakeet-streaming-1 |

The tagged commit on the fork includes the six patch commits above plus
the self-contained CI workflow used to produce the prebuild.

## Build workflow

The prebuild is produced by a public, self-contained GitHub Actions
workflow on the fork:

- Workflow file: `.github/workflows/build-parakeet-streaming-android.yml`
- Trigger: tag push matching `parakeet-streaming-*` (also supports
  manual `workflow_dispatch` for verification runs)
- Runner: `ubuntu-24.04`
- Toolchain: NDK provided by the runner image (`ANDROID_NDK_LATEST_HOME`),
  vcpkg `2025.12.12`, `bare-runtime` and `bare-make` from npm
- Build flags: `-D ANDROID_STL=c++_shared`, matching upstream's published
  parakeet prebuilds workflow
- Smoke test: the workflow `strings`-greps the produced `.bare` and
  fails the build if any of `startStreaming`, `appendStreamingAudio`,
  `endStreaming`, `SileroVad`, or `StreamingProcessor` are missing
- Strip: debug symbols stripped via `llvm-strip --strip-debug` from the
  NDK toolchain prior to publication

The workflow does not depend on private tetherto secrets or composite
actions. It is fully self-contained and can be re-run by any fork
owner.

## Published artifact

| Field | Value |
|---|---|
| Asset name | `qvac__transcription-parakeet-android-arm64.bare` |
| Size | 665,920 bytes |
| SHA256 | `bfb3ee8dc092c800a20de88eeb5b35406902a82c7308efba615429e8dffee85c` |
| Companion file | `SHA256SUMS` (same hash, line-formatted for `sha256sum -c`) |
| Tagged build run | https://github.com/Helldez/qvac/actions/runs/25385911985 |
| Verifying build run | https://github.com/Helldez/qvac/actions/runs/25385533798 (workflow_dispatch ahead of the tag) |

The two build runs above produced byte-identical artifacts, indicating
the build is reproducible across runs on the public CI image.

## Consumption inside JarvisQ

The JarvisQ release pipeline (`.github/workflows/release.yml`)
downloads this artifact, verifies the SHA256 against the value
hardcoded in the workflow, and overlays it onto
`node_modules/@qvac/transcription-parakeet/prebuilds/android-arm64/qvac__transcription-parakeet.bare`
between `npm ci` and `expo prebuild`. The Android Gradle build then
embeds the patched binary into the APK in the normal way.

When the patch series lands in an upstream `@qvac/transcription-parakeet`
release, the overlay step in JarvisQ should be removed and the
dependency in `package.json` bumped instead. This `PROVENANCE.md` file
should be updated or retired at the same time.

## Reproducing the artifact from source

```bash
# 1. Clone the fork at the tag.
git clone --branch parakeet-streaming-1 https://github.com/Helldez/qvac.git
cd qvac

# 2. Install monorepo deps for the parakeet package.
cd packages/qvac-lib-infer-parakeet
npm install

# 3. Cross-compile for android-arm64.
export VCPKG_ROOT=/path/to/vcpkg-2025.12.12
export ANDROID_NDK_HOME=/path/to/Android/Sdk/ndk/<recent>
bare-make generate --platform android --arch arm64 -D ANDROID_STL=c++_shared
bare-make build
bare-make install
"$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip" \
    --strip-debug prebuilds/android-arm64/qvac__transcription-parakeet.bare

# 4. Compare against the published asset.
sha256sum prebuilds/android-arm64/qvac__transcription-parakeet.bare
# Expected: bfb3ee8dc092c800a20de88eeb5b35406902a82c7308efba615429e8dffee85c
```

The CI workflow on the fork runs the same sequence on
`ubuntu-24.04` with vcpkg `2025.12.12` and the runner image's bundled
NDK. Building on a different host or NDK release may produce a binary
that is functionally equivalent but not byte-identical.
