import { createStore } from 'zustand/vanilla';
import type { StoryEngine, StoryUpdate } from '../story/contract.ts';
import type { LangCode, StoryTimeline } from '../story/types.ts';
import { cloneTimeline } from '../story/clone.ts';

export const INITIAL_STORY_CREDITS = 60;

export interface StoryStoreError {
  code: 'invalid-input' | 'insufficient-credits' | 'engine-error';
  message: string;
}

export interface StoryStoreState {
  timeline: StoryTimeline | null;
  composing: boolean;
  credits: number; // simulated balance; charged only when a story reaches 'ready'
  lastError: StoryStoreError | null;
}

export interface StoryStoreActions {
  /** Compose a story from a prompt in the chosen language; optimistic storyboard first. */
  composeStory(prompt: string, lang: LangCode, targetMs?: number): void;
  /** Cost-before-the-click for the UI. Never throws. */
  quoteStory(prompt: string, lang: LangCode, targetMs?: number): number;
  /** Supported languages, surfaced from the engine. */
  languages(): LangCode[];
  /** Clear the current story. */
  reset(): void;
}

export type StoryStore = StoryStoreState & StoryStoreActions;

export interface StoryStoreOptions {
  initialCredits?: number;
}

/** The only layer that invokes the story engine. Engines can be injected for QA. */
export function createStoryStore(engine: StoryEngine, options: StoryStoreOptions = {}) {
  const initialCredits = options.initialCredits ?? INITIAL_STORY_CREDITS;
  if (!Number.isFinite(initialCredits) || initialCredits < 0) throw new Error('Invalid initial story credits.');
  let epoch = 0;

  return createStore<StoryStore>()((set, get) => {
    const fail = (code: StoryStoreError['code'], message: string) =>
      set({ lastError: { code, message }, composing: false });

    return {
      timeline: null,
      composing: false,
      credits: initialCredits,
      lastError: null,

      languages: () => engine.languages(),

      quoteStory(prompt, lang, targetMs) {
        try {
          return engine.quote({ prompt, lang, targetMs });
        } catch {
          return 0;
        }
      },

      composeStory(prompt, lang, targetMs) {
        const trimmed = (prompt ?? '').trim();
        if (!trimmed) {
          fail('invalid-input', 'Enter a prompt to generate a story.');
          return;
        }
        if (!engine.languages().includes(lang)) {
          fail('invalid-input', 'Choose a supported language.');
          return;
        }
        let cost: number;
        try {
          cost = engine.quote({ prompt: trimmed, lang, targetMs });
        } catch {
          fail('engine-error', 'Could not quote this story. Try again.');
          return;
        }
        if (!Number.isFinite(cost) || cost < 0) {
          fail('engine-error', 'The engine returned an invalid story quote.');
          return;
        }
        if (cost > get().credits) {
          fail('insufficient-credits', `This story needs ${cost} credits; ${get().credits} are available.`);
          return;
        }

        const generation = ++epoch;
        let inserted = false;
        let trackedId: string | null = null;
        const buffered: StoryTimeline[] = [];

        // Buffer even synchronous callbacks until the optimistic skeleton is inserted.
        const settle: StoryUpdate = (incoming) => {
          if (generation !== epoch) return;
          if (!inserted) {
            buffered.push(cloneTimeline(incoming));
            return;
          }
          if (incoming.id !== trackedId) return;
          set((state) => {
            if (!state.timeline || state.timeline.id !== incoming.id) return state;
            if (incoming.status === 'queued') return state;
            const settledNow = incoming.status === 'ready' || incoming.status === 'failed';
            const progress = incoming.status === 'ready'
              ? 1
              : Math.max(state.timeline.progress, Math.min(1, Math.max(0, incoming.progress)));
            return {
              // Prompt and language belong to the store, not the callback.
              timeline: { ...cloneTimeline(incoming), prompt: trimmed, lang, progress },
              composing: !settledNow,
              credits: state.credits - (incoming.status === 'ready' ? cost : 0),
              lastError: incoming.status === 'failed'
                ? { code: 'engine-error', message: incoming.error ?? 'The story failed to compose.' }
                : state.lastError,
            };
          });
        };

        try {
          const skeleton = engine.compose({ prompt: trimmed, lang, targetMs }, settle);
          if (generation !== epoch) return;
          if (!skeleton?.id || skeleton.status !== 'queued') {
            throw new Error('The story engine returned an invalid job.');
          }
          trackedId = skeleton.id;
          inserted = true;
          set({ timeline: { ...cloneTimeline(skeleton), prompt: trimmed, lang }, composing: true, lastError: null });
          buffered.forEach(settle);
        } catch (error) {
          if (generation === epoch) {
            fail('engine-error', error instanceof Error ? error.message : 'Could not compose the story.');
          }
        }
      },

      reset() {
        epoch += 1;
        set({ timeline: null, composing: false, lastError: null });
      },
    };
  });
}
