import { useStore } from 'zustand';
import { createProjectStore, type ProjectStore } from './projectStore.ts';
import { browserStorage } from './persist.ts';
import { mockEngine as engine } from '../engine/mockEngine.ts';

export const projectStore = createProjectStore(engine, { storage: browserStorage() });

function useBoundProjectStore(): ProjectStore;
function useBoundProjectStore<T>(selector: (state: ProjectStore) => T): T;
function useBoundProjectStore<T>(selector?: (state: ProjectStore) => T) {
  return useStore(projectStore, selector ?? ((state) => state as unknown as T));
}

/** Hook and imperative Zustand API backed by the same vanilla store. */
export const useProjectStore = Object.assign(useBoundProjectStore, projectStore);
