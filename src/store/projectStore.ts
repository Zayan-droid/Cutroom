import { createStore } from 'zustand/vanilla';
import type { EngineUpdate, GenerationEngine } from '../engine/contract.ts';
import type { Nudge, Take } from '../types.ts';
import type { Store } from './contract.ts';
import { readSession, writeSession, type SessionStorage } from './persist.ts';

export const INITIAL_CREDITS = 120;

export interface StoreError {
  code: 'invalid-input' | 'invalid-take' | 'insufficient-credits' | 'engine-error';
  message: string;
}

/** Additive runtime state; the frozen UI contract remains compatible. */
export interface ProjectStore extends Store {
  reservedCredits: number;
  lastError: StoreError | null;
}

export interface ProjectStoreOptions {
  initialCredits?: number;
  storage?: SessionStorage;
}

const pending = (take: Take) => take.status === 'queued' || take.status === 'generating';
const copyTake = (take: Take): Take => ({ ...take, intent: { ...take.intent } });
const nudges: Nudge[] = ['too-fast', 'too-slow', 'wrong-character', 'more-cinematic', 'less-busy'];

/** The only layer that invokes generation methods. Engines can be injected for QA. */
export function createProjectStore(engine: GenerationEngine, options: ProjectStoreOptions = {}) {
  const initialCredits = options.initialCredits ?? INITIAL_CREDITS;
  if (!Number.isFinite(initialCredits) || initialCredits < 0) throw new Error('Invalid initial credits.');
  const empty = () => ({ credits: initialCredits, takes: [] as Take[], activeTakeId: null, currentDraftIds: [] as string[] });
  let epoch = 0;

  const store = createStore<ProjectStore>()((set, get) => {
    const fail = (code: StoreError['code'], message: string) => set({ lastError: { code, message } });

    // Buffer even synchronous callbacks until the optimistic records are inserted.
    function launch(
      invoke: (update: EngineUpdate) => Take | Take[],
      config: { parentId: string | null; batch?: boolean; charge?: number; free?: boolean },
    ) {
      const generation = epoch;
      let inserted = false;
      let accepted = new Set<string>();
      const updates: Take[] = [];
      const onUpdate: EngineUpdate = (incoming) => {
        if (generation !== epoch) return;
        if (!inserted) { updates.push(copyTake(incoming)); return; }
        if (!accepted.has(incoming.id)) return;
        set((state) => {
          const previous = state.takes.find((take) => take.id === incoming.id);
          if (!previous || !pending(previous)) return state;
          if (incoming.status === 'queued') return state;
          if (!['generating', 'ready', 'failed'].includes(incoming.status)) return state;
          const progress = Number.isFinite(incoming.progress)
            ? Math.max(previous.progress ?? 0, Math.min(1, Math.max(0, incoming.progress!)))
            : previous.progress;
          // Identity, ancestry, input and quoted cost belong to the store, not callbacks.
          const updated: Take = {
            ...previous, status: incoming.status,
            progress: incoming.status === 'ready' ? 1 : progress,
            assetUrl: incoming.status === 'ready' ? incoming.assetUrl : undefined,
            error: incoming.status === 'failed' ? incoming.error || 'Generation failed. Try a free reroll.' : undefined,
          };
          const settled = !pending(updated);
          const charge = previous.kind === 'render' ? previous.cost : 0;
          return {
            takes: state.takes.map((take) => take.id === updated.id ? updated : take),
            credits: state.credits - (updated.status === 'ready' ? charge : 0),
            reservedCredits: state.reservedCredits - (settled ? charge : 0),
          };
        });
      };

      try {
        const result = invoke(onUpdate);
        if (generation !== epoch) return;
        const returned = Array.isArray(result) ? result : [result];
        const existing = new Set(get().takes.map((take) => take.id));
        const ids = new Set(returned.map((take) => take.id));
        if (returned.length !== (config.batch ? 4 : 1) || ids.size !== returned.length ||
          returned.some((take) => !take.id || existing.has(take.id) || take.status !== 'queued')) {
          throw new Error('The engine returned an invalid generation job.');
        }
        const takes = returned.map((take) => ({
          ...copyTake(take), parentId: config.parentId,
          cost: config.free || take.kind === 'draft' ? 0 : config.charge ?? 0,
          progress: 0, assetUrl: undefined, error: undefined,
        }));
        accepted = ids;
        // Mark before notifying subscribers, which may synchronously invoke other actions.
        inserted = true;
        set((state) => ({
          takes: [...state.takes, ...takes],
          activeTakeId: config.batch ? null : takes[0].id,
          currentDraftIds: config.batch ? takes.map((take) => take.id) : state.currentDraftIds,
          reservedCredits: state.reservedCredits + takes.reduce((sum, take) => sum + (take.kind === 'render' ? take.cost : 0), 0),
          lastError: null,
        }));
        updates.forEach(onUpdate);
      } catch (error) {
        accepted.clear();
        if (generation === epoch) fail('engine-error', error instanceof Error ? error.message : 'Could not start generation. Try again.');
      }
    }

    const sourceFor = (id: string, statuses: Take['status'][]) => {
      const source = get().takes.find((take) => take.id === id);
      if (!source || !statuses.includes(source.status)) {
        fail('invalid-take', 'Choose an eligible take before starting this action.');
        return undefined;
      }
      return copyTake(source);
    };

    return {
      ...(readSession(options.storage) ?? empty()), reservedCredits: 0, lastError: null,
      submitDraft(prompt, intent) {
        if (!prompt.trim() || !['social', 'ad', 'cinematic'].includes(intent.kind)) {
          fail('invalid-input', 'Enter a prompt and choose an intent.'); return;
        }
        launch((update) => engine.generateDraft({ prompt: prompt.trim(), intent: { ...intent }, parentId: null }, update), { parentId: null, batch: true });
      },
      selectTake(id) {
        if (!get().takes.some((take) => take.id === id)) { fail('invalid-take', 'That take is no longer available.'); return; }
        set({ activeTakeId: id, lastError: null });
      },
      render() {
        const source = sourceFor(get().activeTakeId ?? '', ['ready']);
        if (!source) return;
        if (source.kind !== 'draft') { fail('invalid-take', 'Choose a ready draft to render.'); return; }
        if (get().takes.some((take) => take.parentId === source.id && take.kind === 'render' && pending(take))) {
          fail('invalid-take', 'This draft already has a render in progress.'); return;
        }
        let cost: number;
        try { cost = engine.quote('render', { ...source.intent }); }
        catch { fail('engine-error', 'Could not quote this render. Try again.'); return; }
        if (!Number.isFinite(cost) || cost < 0) { fail('engine-error', 'The engine returned an invalid credit quote.'); return; }
        if (cost > get().credits - get().reservedCredits) {
          fail('insufficient-credits', `This render needs ${cost} credits; ${get().credits - get().reservedCredits} are available.`); return;
        }
        launch((update) => engine.renderFinal({ source }, update), { parentId: source.id, charge: cost });
      },
      remix(id) {
        const source = sourceFor(id, ['ready']);
        if (source) launch((update) => engine.remix({ source }, update), { parentId: id, batch: true });
      },
      retry(id) {
        const failed = sourceFor(id, ['failed']);
        if (failed) launch((update) => engine.retry({ failed }, update), { parentId: id, free: true });
      },
      applyNudge(id, nudge) {
        if (!nudges.includes(nudge)) { fail('invalid-input', 'Choose a supported adjustment.'); return; }
        const source = sourceFor(id, ['ready', 'failed']);
        // Nudges are exploratory/recovery branches, so they carry no render charge.
        if (source) launch((update) => engine.nudge({ source, nudge }, update), { parentId: id, free: true });
      },
      reset() { epoch += 1; set({ ...empty(), reservedCredits: 0, lastError: null }); },
    };
  });
  if (options.storage) store.subscribe((state) => writeSession(options.storage, state));
  return store;
}
