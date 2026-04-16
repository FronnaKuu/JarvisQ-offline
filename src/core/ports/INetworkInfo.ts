// ---- Network Info Port ---------------------------------------------------
// Minimal connectivity probe. Implementations must answer quickly (bounded
// timeout) and must not throw — surface failures as `false`.

export interface INetworkInfo {
  isOnline(): Promise<boolean>;
}
