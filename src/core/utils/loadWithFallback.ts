// ─── Load Model with HTTP Fallback ───────────────────────────────────────────
// Wraps @qvac/sdk loadModel with a progress-based timeout. If the P2P registry
// download stalls (no progress events within STALL_TIMEOUT_MS), automatically
// retries using HTTPS fallback URLs from HuggingFace.
//
// This handles the case where a Hyperswarm blob core has no active seeders,
// which causes the download to hang indefinitely without error.

import { loadModel } from '@qvac/sdk';
import type { ModelProgressUpdate } from '@qvac/sdk';

/** Milliseconds without a progress event before considering the download stalled. */
const STALL_TIMEOUT_MS = 30_000;

/** Interval at which we check for stalled state. */
const CHECK_INTERVAL_MS = 5_000;

/** Arguments for loadModel (excluding onProgress, which is managed by the wrapper). */
export interface LoadModelArgs {
  modelSrc: string;
  modelType: string;
  modelConfig?: Record<string, unknown>;
}

export interface FallbackLoadOptions {
  /** Primary load arguments (typically using registry:// P2P sources). */
  primary: LoadModelArgs;
  /** HTTPS fallback arguments (HuggingFace direct download). */
  httpFallback: LoadModelArgs;
  /** Optional progress callback forwarded to whichever download is active. */
  onProgress?: (p: ModelProgressUpdate) => void;
}

/**
 * Attempts to load a model via the P2P registry. If no progress is received
 * within {@link STALL_TIMEOUT_MS}, transparently retries with HTTPS URLs.
 *
 * @returns The loaded model ID.
 */
export async function loadModelWithFallback(
  options: FallbackLoadOptions,
): Promise<string> {
  const { primary, httpFallback, onProgress } = options;

  try {
    return await loadWithStallDetection(primary, onProgress);
  } catch (err) {
    const isStall =
      err instanceof Error && err.message === 'DOWNLOAD_STALLED';

    if (!isStall) throw err;

    console.warn(
      '[loadWithFallback] P2P download stalled, switching to HTTPS fallback',
    );
    return loadModel({ ...httpFallback, onProgress } as never);
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

export function loadWithStallDetection(
  args: LoadModelArgs,
  onProgress?: (p: ModelProgressUpdate) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let lastProgressAt = Date.now();
    let settled = false;

    const stallChecker = setInterval(() => {
      if (settled) return;
      if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
        settled = true;
        clearInterval(stallChecker);
        reject(new Error('DOWNLOAD_STALLED'));
      }
    }, CHECK_INTERVAL_MS);

    const progressWrapper = (p: ModelProgressUpdate) => {
      lastProgressAt = Date.now();
      onProgress?.(p);
    };

    (loadModel as Function)({ ...args, onProgress: progressWrapper }).then(
      (modelId: string) => {
        if (!settled) {
          settled = true;
          clearInterval(stallChecker);
          resolve(modelId);
        }
      },
      (err: unknown) => {
        if (!settled) {
          settled = true;
          clearInterval(stallChecker);
          reject(err);
        }
      },
    );
  });
}
