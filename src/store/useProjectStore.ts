import { useStore } from 'zustand';
import { createProjectStore, type ProjectStore } from './projectStore.ts';
import { browserStorage } from './persist.ts';
import { mockEngine } from '../engine/mockEngine.ts';
import { remoteEngine } from '../engine/remoteEngine.ts';
import { remoteEnabled } from '../lib/apiClient.ts';

// Real backend when VITE_USE_REMOTE_ENGINE=true and VITE_API_BASE is set;
// otherwise the bundled mock engine, which always works offline.
const engine = remoteEnabled ? remoteEngine : mockEngine;

export const projectStore = createProjectStore(engine, { storage: browserStorage() });

function useBoundProjectStore(): ProjectStore;
function useBoundProjectStore<T>(selector: (state: ProjectStore) => T): T;
function useBoundProjectStore<T>(selector?: (state: ProjectStore) => T) {
  return useStore(projectStore, selector ?? ((state) => state as unknown as T));
}

/** Hook and imperative Zustand API backed by the same vanilla store. */
export const useProjectStore = Object.assign(useBoundProjectStore, projectStore);
