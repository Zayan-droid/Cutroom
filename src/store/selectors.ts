import { useShallow } from 'zustand/react/shallow';
import type { StoreState } from './contract.ts';
import type { ProjectStore } from './projectStore.ts';
import type { Take } from '../types.ts';
import { deriveRail, type RailEntry } from './rail.ts';
import { useProjectStore } from './useProjectStore.ts';

export const selectActiveTake = (state: StoreState): Take | null => state.takes.find((take) => take.id === state.activeTakeId) ?? null;
export const selectDrafts = (state: StoreState): Take[] => {
  const byId = new Map(state.takes.map((take) => [take.id, take]));
  return state.currentDraftIds.map((id) => byId.get(id)).filter((take): take is Take => take?.kind === 'draft');
};
export const selectAvailableCredits = (state: ProjectStore) => state.credits - state.reservedCredits;

// Zustand 5 requires a stable snapshot for derived object/array selectors.
let previousTakes: Take[] | undefined;
let previousActive: string | null | undefined;
let previousRail: RailEntry[] = [];
export function selectRail(state: StoreState): RailEntry[] {
  if (state.takes !== previousTakes || state.activeTakeId !== previousActive) {
    previousTakes = state.takes;
    previousActive = state.activeTakeId;
    previousRail = deriveRail(state.takes, state.activeTakeId);
  }
  return previousRail;
}

export const useActiveTake = () => useProjectStore(selectActiveTake);
export const useDrafts = () => useProjectStore(useShallow(selectDrafts));
export const useCurrentDrafts = useDrafts;
export const useRail = () => useProjectStore(selectRail);
export const useCredits = () => useProjectStore((state) => state.credits);
export const useAvailableCredits = () => useProjectStore(selectAvailableCredits);
export const useStoreError = () => useProjectStore((state) => state.lastError);
