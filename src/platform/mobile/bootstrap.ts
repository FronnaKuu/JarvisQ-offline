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

  // Set the audio mode once. Leaving allowsRecordingIOS=true also permits
  // playback, so the recorder and player can share the same session without
  // flipping it per call — flipping was visible in Android logs as repeated
  // setMode / setSpeakerphoneOn churn and correlated with first-word cuts on
  // TTS clauses. On iOS, playsInSilentModeIOS keeps playback audible even
  // when the physical mute switch is engaged.
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  }).catch(() => {});

  bootstrapped = true;
}
