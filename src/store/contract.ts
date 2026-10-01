// ─────────────────────────────────────────────────────────────────────────────
// STORE PUBLIC API — frozen in Step 0. This is the ONLY surface the UI (Part C)
// depends on. Part B implements it for real; Part C ships against a mock that
// satisfies the same shape, so swapping is a one-line import change.
// ─────────────────────────────────────────────────────────────────────────────

import type { Intent, Nudge, Take } from '@/types';

export interface StoreState {
  credits: number;
  activeTakeId: string | null;
  takes: Take[]; // flat list forming a tree via parentId
  currentDraftIds: string[]; // the batch currently shown in the draft grid
}

export interface StoreActions {
  /** Insert four draft takes and drive them to ready/failed. */
  submitDraft(prompt: string, intent: Intent): void;
  /** Set the active take (drives the stage + rail). */
  selectTake(id: string): void;
  /** Commit the active take to a full render. Costs credits on success only. */
  render(): void;
  /** Branch four variant takes from a take. */
  remix(id: string): void;
  /** Reroll a failed take — always free. */
  retry(id: string): void;
  /** Branch a new take with one adjusted parameter. */
  applyNudge(id: string, nudge: Nudge): void;
  /** Clear the session (back to the empty land screen). */
  reset(): void;
}

export type Store = StoreState & StoreActions;
