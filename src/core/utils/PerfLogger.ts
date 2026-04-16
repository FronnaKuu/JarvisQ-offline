// ---- PerfLogger ----------------------------------------------------------
// Logs device performance snapshots before and after LLM generation.
// Uses the DevicePerf native module when available (Android).
// Gracefully degrades on platforms without it (iOS, desktop, web).

export interface PerfSnapshot {
  batteryPct: number;
  batteryCurrentMicroAmps: number;
  ramUsedMb: number;
  ramAvailMb: number;
  ramTotalMb: number;
  nativeHeapMb: number;
  jvmHeapMb: number;
  timestampMs: number;
}

let getNativeSnapshot: (() => Promise<{
  batteryPct: number;
  batteryCurrentMicroAmps: number;
  ramUsedMb: number;
  ramAvailMb: number;
  ramTotalMb: number;
  nativeHeapMb: number;
  jvmHeapMb: number;
}>) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../../modules/device-perf/src');
  getNativeSnapshot = mod.getSnapshot;
} catch {
  // Native module not available on this platform.
}

const EMPTY_SNAPSHOT: PerfSnapshot = {
  batteryPct: -1,
  batteryCurrentMicroAmps: 0,
  ramUsedMb: 0,
  ramAvailMb: 0,
  ramTotalMb: 0,
  nativeHeapMb: 0,
  jvmHeapMb: 0,
  timestampMs: 0,
};

export async function captureSnapshot(): Promise<PerfSnapshot> {
  if (!getNativeSnapshot) return { ...EMPTY_SNAPSHOT, timestampMs: Date.now() };

  try {
    const native = await getNativeSnapshot();
    return {
      batteryPct: native.batteryPct ?? -1,
      batteryCurrentMicroAmps: native.batteryCurrentMicroAmps ?? 0,
      ramUsedMb: native.ramUsedMb ?? 0,
      ramAvailMb: native.ramAvailMb ?? 0,
      ramTotalMb: native.ramTotalMb ?? 0,
      nativeHeapMb: native.nativeHeapMb ?? 0,
      jvmHeapMb: native.jvmHeapMb ?? 0,
      timestampMs: Date.now(),
    };
  } catch {
    return { ...EMPTY_SNAPSHOT, timestampMs: Date.now() };
  }
}

export function logLlmStart(snap: PerfSnapshot): void {
  const parts: string[] = [];

  if (snap.batteryPct >= 0) {
    let batteryStr = `battery=${snap.batteryPct}%`;
    if (snap.batteryCurrentMicroAmps > 0) {
      batteryStr += ` current=${snap.batteryCurrentMicroAmps}uA`;
    }
    parts.push(batteryStr);
  }

  if (snap.ramTotalMb > 0) {
    parts.push(
      `RAM used=${snap.ramUsedMb}MB avail=${snap.ramAvailMb}MB total=${snap.ramTotalMb}MB`,
    );
  }

  if (snap.nativeHeapMb > 0 || snap.jvmHeapMb > 0) {
    parts.push(`nativeHeap=${snap.nativeHeapMb}MB jvmHeap=${snap.jvmHeapMb}MB`);
  }

  console.log(`[llm-start] ${parts.join(' | ')}`);
}

export function logLlmDone(
  start: PerfSnapshot,
  end: PerfSnapshot,
  durationMs: number,
  tokenCount: number,
): void {
  const speedTokPerSec =
    durationMs > 0 ? (tokenCount / (durationMs / 1000)).toFixed(1) : '0.0';

  const parts: string[] = [
    `duration=${durationMs}ms tokens=${tokenCount} speed=${speedTokPerSec}tok/s`,
  ];

  if (start.batteryPct >= 0 && end.batteryPct >= 0) {
    const delta = end.batteryPct - start.batteryPct;
    const sign = delta >= 0 ? '+' : '';
    parts.push(`battery=${start.batteryPct}%->${end.batteryPct}% d=${sign}${delta}%`);
  }

  if (end.nativeHeapMb > 0) {
    parts.push(`nativeHeap=${end.nativeHeapMb}MB`);
  }

  console.log(`[llm-done] ${parts.join(' | ')}`);
}
