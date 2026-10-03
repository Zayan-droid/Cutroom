import { useStore } from 'zustand';
import { createStoryStore, type StoryStore } from './storyStore.ts';
import { storyEngine } from '../story/storyEngine.ts';
import { remoteStoryEngine } from '../story/remoteStoryEngine.ts';
import { remoteEnabled } from '../lib/apiClient.ts';

// Real backend (local structure + generated scene images) when enabled;
// otherwise the fully offline procedural story engine.
const engine = remoteEnabled ? remoteStoryEngine : storyEngine;

export const storyStore = createStoryStore(engine);

function useBoundStoryStore(): StoryStore;
function useBoundStoryStore<T>(selector: (state: StoryStore) => T): T;
function useBoundStoryStore<T>(selector?: (state: StoryStore) => T) {
  return useStore(storyStore, selector ?? ((state) => state as unknown as T));
}

/** Hook and imperative Zustand API backed by the same vanilla story store. */
export const useStoryStore = Object.assign(useBoundStoryStore, storyStore);
