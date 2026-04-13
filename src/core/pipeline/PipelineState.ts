// ─── Pipeline State Machine ───────────────────────────────────────────────────

import type { PipelinePhase } from '@domain/types';

export const PIPELINE_TRANSITIONS: Record<PipelinePhase, PipelinePhase[]> = {
  IDLE: ['LISTENING'],
  LISTENING: ['THINKING', 'IDLE'],
  THINKING: ['SPEAKING', 'IDLE'],
  SPEAKING: ['LISTENING', 'IDLE'],
};

export function canTransition(
  from: PipelinePhase,
  to: PipelinePhase,
): boolean {
  return PIPELINE_TRANSITIONS[from].includes(to);
}
