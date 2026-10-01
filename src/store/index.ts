// ─────────────────────────────────────────────────────────────────────────────
// Part C ↔ store integration barrel (Checkpoint 2: C ← B).
// The UI imports the store ONLY through here. It is now wired to Part B's real
// store (projectStore), which currently runs on Part A's fallbackEngine until
// mockEngine.ts lands — swapping that is one import in useProjectStore.ts, and
// the UI does not change. See Docs/WORKSTREAMS.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useProjectStore } from './useProjectStore.ts';
import type { Intent, Nudge } from '@/types';

export { useProjectStore };
export {
  useActiveTake,
  useDrafts,
  useCurrentDrafts,
  useRail,
  useCredits,
  useAvailableCredits,
  useStoreError,
} from './selectors.ts';
export type { RailEntry } from './rail.ts';
export type { StoreError } from './projectStore.ts';

/** True when the project holds at least one take (land vs working view). */
export const useHasTakes = () => useProjectStore((s) => s.takes.length > 0);

/** Stable imperative action handles — call without subscribing to state. */
export const actions = {
  submitDraft: (prompt: string, intent: Intent) => useProjectStore.getState().submitDraft(prompt, intent),
  selectTake: (id: string) => useProjectStore.getState().selectTake(id),
  render: () => useProjectStore.getState().render(),
  remix: (id: string) => useProjectStore.getState().remix(id),
  retry: (id: string) => useProjectStore.getState().retry(id),
  applyNudge: (id: string, nudge: Nudge) => useProjectStore.getState().applyNudge(id, nudge),
  reset: () => useProjectStore.getState().reset(),
};
