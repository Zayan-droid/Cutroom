import type { Intent, Take } from '../types.ts';
import type { StoreState } from './contract.ts';

export const SESSION_KEY = 'cutroom.project.v1';
export type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function browserStorage(): SessionStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function isIntent(value: unknown): value is Intent {
  return record(value) && ['social', 'ad', 'cinematic'].includes(String(value.kind)) &&
    ['subject', 'style', 'motion', 'mood'].every((key) => typeof value[key] === 'string');
}
function isTake(value: unknown): value is Take {
  return record(value) && typeof value.id === 'string' && value.id.length > 0 &&
    (value.parentId === null || typeof value.parentId === 'string') &&
    ['draft', 'render'].includes(String(value.kind)) && ['queued', 'generating', 'ready', 'failed'].includes(String(value.status)) &&
    typeof value.prompt === 'string' && isIntent(value.intent) && finite(value.cost) && finite(value.createdAt) &&
    (value.progress === undefined || (finite(value.progress) && value.progress <= 1)) &&
    ['assetUrl', 'error', 'label'].every((key) => value[key] === undefined || typeof value[key] === 'string');
}

export function readSession(storage?: SessionStorage): StoreState | undefined {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const snapshot: unknown = JSON.parse(raw);
    if (!record(snapshot) || snapshot.version !== 1 || !record(snapshot.state)) return undefined;
    const state = snapshot.state;
    if (!finite(state.credits) || !Array.isArray(state.takes) || !state.takes.every(isTake) ||
      !Array.isArray(state.currentDraftIds) || !state.currentDraftIds.every((id) => typeof id === 'string')) return undefined;
    const takes = state.takes;
    const byId = new Map(takes.map((take) => [take.id, take]));
    if (byId.size !== takes.length) return undefined;
    for (const take of takes) {
      const seen = new Set<string>([take.id]);
      let parentId = take.parentId;
      while (parentId !== null) {
        if (seen.has(parentId) || !byId.has(parentId)) return undefined;
        seen.add(parentId);
        parentId = byId.get(parentId)!.parentId;
      }
    }
    return {
      credits: state.credits,
      activeTakeId: typeof state.activeTakeId === 'string' && byId.has(state.activeTakeId) ? state.activeTakeId : null,
      currentDraftIds: [...new Set(state.currentDraftIds as string[])].filter((id) => byId.get(id)?.kind === 'draft'),
      // Timers cannot survive a refresh. Preserve ancestry and offer a free retry.
      takes: takes.map((take) => take.status === 'queued' || take.status === 'generating'
        ? { ...take, status: 'failed', assetUrl: undefined, error: 'Generation was interrupted by a refresh. Reroll for free.' }
        : take),
    };
  } catch { return undefined; }
}

export function writeSession(storage: SessionStorage | undefined, state: StoreState): void {
  try {
    const { credits, takes, activeTakeId, currentDraftIds } = state;
    storage?.setItem(SESSION_KEY, JSON.stringify({ version: 1, state: { credits, takes, activeTakeId, currentDraftIds } }));
  } catch { /* Storage denial/quota must not interrupt a generation or charge. */ }
}
