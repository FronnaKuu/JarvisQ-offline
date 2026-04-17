import { requireNativeModule } from 'expo-modules-core';

export interface DevicePerfSnapshot {
  ramTotalMb: number;
  ramAvailMb: number;
  ramUsedMb: number;
  nativeHeapMb: number;
  jvmHeapMb: number;
  /** Battery percentage (0–100), or -1 if unavailable. */
  batteryPct: number;
  /** Absolute battery current draw in µA. */
  batteryCurrentMicroAmps: number;
}

const DevicePerf = requireNativeModule('DevicePerf');

export async function getSnapshot(): Promise<DevicePerfSnapshot> {
  return DevicePerf.getSnapshot();
}
