#!/usr/bin/env bash
# Build qvac-lib-infer-parakeet with Silero VAD streaming for android-arm64
# and install the prebuilt .bare into the JarvisQVAC node_modules so the
# next expo prebuild picks it up.
#
# Prereqs (Windows):
#   - MSVC Build Tools 2022 (C++ workload) — needed for vcpkg host tools
#   - Android NDK (r25+) available under ANDROID_HOME
#   - vcpkg cloned + bootstrapped
#
# Usage:
#   QVAC_SRC=/c/Users/raffa/Documents/qvac-src \
#   VCPKG_ROOT=/c/Users/raffa/vcpkg \
#   ANDROID_HOME=/c/Users/raffa/AppData/Local/Android/Sdk \
#   JARVIS_ROOT=/c/Users/raffa/Documents/JarvisQVAC \
#   ./build-android-arm64.sh

set -euo pipefail

QVAC_SRC="${QVAC_SRC:-/c/Users/raffa/Documents/qvac-src}"
VCPKG_ROOT="${VCPKG_ROOT:-/c/Users/raffa/vcpkg}"
ANDROID_HOME="${ANDROID_HOME:-/c/Users/raffa/AppData/Local/Android/Sdk}"
JARVIS_ROOT="${JARVIS_ROOT:-/c/Users/raffa/Documents/JarvisQVAC}"

export VCPKG_ROOT ANDROID_HOME

PARAKEET_DIR="$QVAC_SRC/packages/qvac-lib-infer-parakeet"
[ -d "$PARAKEET_DIR" ] || { echo "parakeet source not found at $PARAKEET_DIR"; exit 1; }
[ -d "$VCPKG_ROOT" ]   || { echo "vcpkg not found at $VCPKG_ROOT";               exit 1; }
[ -d "$ANDROID_HOME" ] || { echo "Android SDK not found at $ANDROID_HOME";       exit 1; }

cd "$PARAKEET_DIR"

echo "=== [1/4] bare-make generate (android-arm64) ==="
rm -rf build
bare-make generate --platform android --arch arm64

echo "=== [2/4] bare-make build ==="
bare-make build

echo "=== [3/4] bare-make install ==="
bare-make install

BARE_OUT="$PARAKEET_DIR/prebuilds/android-arm64/qvac__transcription-parakeet.bare"
[ -f "$BARE_OUT" ] || { echo "build produced no .bare at $BARE_OUT"; exit 1; }

JARVIS_PREBUILDS="$JARVIS_ROOT/node_modules/@qvac/transcription-parakeet/prebuilds/android-arm64"
mkdir -p "$JARVIS_PREBUILDS"
cp "$BARE_OUT" "$JARVIS_PREBUILDS/"
echo "=== [4/4] copied .bare -> $JARVIS_PREBUILDS ==="

# Sync the modified JS wrapper + type declarations too, so the new
# appendStreamingAudio / endStreaming APIs are visible to TypeScript.
cp "$PARAKEET_DIR/parakeet.js"   "$JARVIS_ROOT/node_modules/@qvac/transcription-parakeet/"
cp "$PARAKEET_DIR/index.js"      "$JARVIS_ROOT/node_modules/@qvac/transcription-parakeet/"
cp "$PARAKEET_DIR/index.d.ts"    "$JARVIS_ROOT/node_modules/@qvac/transcription-parakeet/"
echo "=== JS wrapper + types synced ==="

echo
echo "Done. Next:"
echo "  cd $JARVIS_ROOT"
echo "  # flip AppConfig.stt.parakeetStreamingEnabled = true"
echo "  npx patch-package @qvac/transcription-parakeet  # regenerate patch"
echo "  npx expo prebuild --platform android --clean    # rebuild worker bundle"
echo "  (cd android && ./gradlew assembleRelease)"
echo "  adb install -r android/app/build/outputs/apk/release/app-release.apk"
