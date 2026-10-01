import { useStore } from 'zustand';
import { createStoryStore, type StoryStore } from './storyStore.ts';
import { storyEngine as engine } from '../story/storyEngine.ts';

export const storyStore = createStoryStore(engine);

function useBoundStoryStore(): StoryStore;
function useBoundStoryStore<T>(selector: (state: StoryStore) => T): T;
function useBoundStoryStore<T>(selector?: (state: StoryStore) => T) {
  return useStore(storyStore, selector ?? ((state) => state as unknown as T));
}

/** Hook and imperative Zustand API backed by the same vanilla story store. */
export const useStoryStore = Object.assign(useBoundStoryStore, storyStore);
