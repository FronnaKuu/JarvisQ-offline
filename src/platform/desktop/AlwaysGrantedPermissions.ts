// ---- Desktop Permissions (placeholder) -----------------------------------
// Desktop shells (Electron, Tauri, Pear) handle microphone permissions at the
// OS level outside the JS sandbox. Until the audio backend is chosen we report
// `granted` so the pipeline does not gate itself on a prompt that cannot be
// shown. Replace with a real adapter when audio capture lands.

import type {
  IPermissions,
  PermissionStatus,
} from '@core/ports/IPermissions';

export class AlwaysGrantedPermissions implements IPermissions {
  async getMicrophoneStatus(): Promise<PermissionStatus> {
    return 'granted';
  }

  async requestMicrophone(): Promise<PermissionStatus> {
    return 'granted';
  }
}
