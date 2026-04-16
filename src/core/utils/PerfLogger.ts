// ─── PerfLogger ───────────────────────────────────────────────────────────────
// Logs device performance snapshots before and after LLM generation.
//
// What is captured:
//   - Battery level (%) via expo-battery
//   - JS heap used / total (MB) via the Hermes performance.memory API (RN 0.73+)
//   - Total device RAM (MB) via expo-device.totalMemory (Android / iOS)
//
// What is NOT available without a custom native module:
//   - Battery current draw (µA) — requires Android BatteryManager native bridge
//   - Available / used system RAM — requires ActivityManager native bridge
//   - Native heap / JVM heap — requires native bridge

import * as Battery from 'expo-battery';
import * as Device from 'expo-device';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PerfSnapshot {
  /** Battery charge level (0–1), or null if the API is unavailable. */
  batteryFraction: number | null;
  /** JS heap currently in use (MB), or null if unavailable. */
  jsHeapUsedMb: number | null;
  /** Total JS heap allocated (MB), or null if unavailable. */
  jsHeapTotalMb: number | null;
  /** Total physical RAM on the device (MB), or null if unavailable. */
  ramTotalMb: number | null;
  timestampMs: number;
}

// ─── Hermes performance.memory typing ────────────────────────────────────────

interface HermesMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: HermesMemory;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bytesToMb(bytes: number): number {
  return Math.round(bytes / 1_048_576);
}

function readJsHeap(): Pick<PerfSnapshot, 'jsHeapUsedMb' | 'jsHeapTotalMb'> {
  const perf = globalThis.performance as PerformanceWithMemory | undefined;
  const mem = perf?.memory;
  if (!mem) return { jsHeapUsedMb: null, jsHeapTotalMb: null };
  return {
    jsHeapUsedMb: bytesToMb(mem.usedJSHeapSize),
    jsHeapTotalMb: bytesToMb(mem.totalJSHeapSize),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Captures a device performance snapshot asynchronously. */
export async function captureSnapshot(): Promise<PerfSnapshot> {
  let batteryFraction: number | null = null;
  try {
    batteryFraction = await Battery.getBatteryLevelAsync();
    // -1 is returned on platforms / simulators where the API is unsupported.
    if (batteryFraction < 0) batteryFraction = null;
  } catch {
    // Silently skip — battery API unavailable (e.g. web, some simulators).
  }

  const heap = readJsHeap();

  const ramTotalMb =
    Device.totalMemory != null ? bytesToMb(Device.totalMemory) : null;

  return {
    batteryFraction,
    ...heap,
    ramTotalMb,
    timestampMs: Date.now(),
  };
}

/**
 * Logs a [llm-start] line with the snapshot captured before generation.
 *
 * Example output:
 *   [llm-start] battery=39% | RAM total=11513MB | jsHeap=100MB/256MB
 */
export function logLlmStart(snap: PerfSnapshot): void {
  const parts: string[] = [];

  if (snap.batteryFraction != null) {
    parts.push(`battery=${Math.round(snap.batteryFraction * 100)}%`);
  }
  if (snap.ramTotalMb != null) {
    parts.push(`RAM total=${snap.ramTotalMb}MB`);
  }
  if (snap.jsHeapUsedMb != null && snap.jsHeapTotalMb != null) {
    parts.push(`jsHeap=${snap.jsHeapUsedMb}MB/${snap.jsHeapTotalMb}MB`);
  }

  console.log(`[llm-start] ${parts.join(' | ')}`);
}

/**
 * Logs a [llm-done] line with generation duration, token count, speed, and
 * any changes in battery / heap between the start and end snapshots.
 *
 * Example output:
 *   [llm-done] duration=19400ms tokens=240 speed=12.4tok/s | battery=39%→40% Δ=+1% | jsHeap=105MB
 */
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

  if (start.batteryFraction != null && end.batteryFraction != null) {
    const startPct = Math.round(start.batteryFraction * 100);
    const endPct = Math.round(end.batteryFraction * 100);
    const delta = endPct - startPct;
    const sign = delta >= 0 ? '+' : '';
    parts.push(`battery=${startPct}%→${endPct}% Δ=${sign}${delta}%`);
  }

  if (end.jsHeapUsedMb != null) {
    parts.push(`jsHeap=${end.jsHeapUsedMb}MB`);
  }

  console.log(`[llm-done] ${parts.join(' | ')}`);
}
