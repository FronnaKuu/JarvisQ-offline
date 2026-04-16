// ---- Permissions Port ----------------------------------------------------
// Platform-agnostic runtime-permission queries. Kept minimal: extend only when
// a concrete consumer needs a new capability.

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface IPermissions {
  getMicrophoneStatus(): Promise<PermissionStatus>;
  requestMicrophone(): Promise<PermissionStatus>;
}
