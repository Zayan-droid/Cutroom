import type { Intent, Nudge, Take, TakeKind } from '../types';

export type EngineUpdate = (take: Take) => void;

/** Synchronous queued takes, followed by asynchronous status/progress updates. */
export interface GenerationEngine {
  generateDraft(input: { prompt: string; intent: Intent; parentId: string | null }, onUpdate: EngineUpdate): Take[];
  renderFinal(input: { source: Take }, onUpdate: EngineUpdate): Take;
  remix(input: { source: Take }, onUpdate: EngineUpdate): Take[];
  retry(input: { failed: Take }, onUpdate: EngineUpdate): Take;
  nudge(input: { source: Take; nudge: Nudge }, onUpdate: EngineUpdate): Take;
  quote(kind: TakeKind, intent: Intent): number;
}
