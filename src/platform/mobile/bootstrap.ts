// ─── Mobile Bootstrap ────────────────────────────────────────────────────────
// Instantiates every platform adapter (file system, key-value store, database)
// and registers them into the core platform container. Must be awaited before
// any core service or repository is used — typically from the Expo root layout.

import { Audio } from 'expo-av';
import { registerPlatform } from '@core/platform/PlatformContainer';
import { ExpoFileSystem } from './ExpoFileSystem';
import { AsyncStorageKeyValueStore } from './AsyncStorageKeyValueStore';
import { ExpoSqliteDatabase } from './ExpoSqliteDatabase';
import { RnVibrationHaptics } from './RnVibrationHaptics';
import { ExpoPermissions } from './ExpoPermissions';
import { FetchNetworkInfo } from '@core/net/FetchNetworkInfo';

let bootstrapped = false;

export async function bootstrapMobile(): Promise<void> {
  if (bootstrapped) return;

  const database = await ExpoSqliteDatabase.open();
  registerPlatform({
    fileSystem: new ExpoFileSystem(),
    keyValueStore: new AsyncStorageKeyValueStore(),
    database,
    haptics: new RnVibrationHaptics(),
    permissions: new ExpoPermissions(),
    networkInfo: new FetchNetworkInfo(),
  });

  // Initialize in playback-only mode so the first TTS clip (e.g. a bootstrap
  // notice) routes through the loud media stream, not MODE_IN_COMMUNICATION
  // (which would play it through the earpiece at low volume). The recorder
  // flips allowsRecordingIOS=true before capture; the player flips it back.
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  }).catch(() => {});

  bootstrapped = true;
}
