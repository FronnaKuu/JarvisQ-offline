// ---- Expo Permissions (Mobile) -------------------------------------------
// Wraps expo-av permission APIs behind the IPermissions port so the UI layer
// can prompt for microphone access without importing Expo directly.

import { Audio } from 'expo-av';
import type {
  IPermissions,
  PermissionStatus,
} from '@core/ports/IPermissions';

type ExpoStatus = 'granted' | 'denied' | 'undetermined';

function toPortStatus(status: ExpoStatus): PermissionStatus {
  return status;
}

export class ExpoPermissions implements IPermissions {
  async getMicrophoneStatus(): Promise<PermissionStatus> {
    const response = await Audio.getPermissionsAsync();
    return toPortStatus(response.status);
  }

  async requestMicrophone(): Promise<PermissionStatus> {
    const response = await Audio.requestPermissionsAsync();
    return toPortStatus(response.status);
  }
}
