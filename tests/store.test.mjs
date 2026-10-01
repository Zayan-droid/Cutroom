import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore } from '../src/store/projectStore.ts';
import { deriveLineage, deriveRail } from '../src/store/rail.ts';
import { readSession, SESSION_KEY } from '../src/store/persist.ts';
import { fallbackEngine } from '../src/store/fallbackEngine.ts';
import { selectDrafts, selectRail } from '../src/store/selectors.ts';

const intent = { kind: 'social', subject: 'runner', style: 'film', motion: 'tracking', mood: 'calm' };

function harness(options = {}) {
  let serial = 0;
  const jobs = new Map();
  const calls = [];
  const make = (input, update) => {
    const take = { id: `t${++serial}`, parentId: null, kind: 'draft', status: 'queued', prompt: 'A runner', intent: { ...intent }, cost: 0, createdAt: serial, ...input };
    jobs.set(take.id, { take, update });
    if (options.synchronous) update({ ...take, status: 'ready', assetUrl: '/fixture.mp4' });
    return take;
  };
  const engine = {
    quote: () => options.cost ?? 4,
    generateDraft(input, update) { calls.push('draft'); return Array.from({ length: 4 }, () => make(input, update)); },
    renderFinal({ source }, update) { calls.push('render'); return make({ ...source, id: `r${++serial}`, kind: 'render', status: 'queued', cost: 4 }, update); },
    remix({ source }, update) { calls.push('remix'); return Array.from({ length: 4 }, () => make({ prompt: source.prompt, intent: { ...source.intent } }, update)); },
    retry({ failed }, update) { calls.push('retry'); return make({ ...failed, id: `retry${++serial}`, status: 'queued', cost: 999 }, update); },
    nudge({ source, nudge }, update) { calls.push('nudge'); return make({ prompt: source.prompt, intent: { ...source.intent, motion: nudge } }, update); },
  };
  const store = createProjectStore(engine, options);
  const emit = (id, status, patch = {}) => {
    const { take, update } = jobs.get(id);
    update({ ...take, status, ...(status === 'ready' ? { assetUrl: '/fixture.mp4' } : {}), ...patch });
  };
  const drafts = () => { store.getState().submitDraft('A runner', intent); return store.getState().currentDraftIds; };
  const render = (id) => { store.getState().selectTake(id); store.getState().render(); return store.getState().activeTakeId; };
  return { store, engine, emit, drafts, render, calls, jobs };
}

test('inserts four queued roots immediately, copies input, and receives progress', () => {
  const h = harness();
  const ids = h.drafts();
  assert.equal(ids.length, 4);
  assert.ok(h.store.getState().takes.every((take) => take.status === 'queued' && take.parentId === null));
  h.emit(ids[0], 'generating', { progress: 0.5 });
  h.emit(ids[0], 'generating', { progress: 0.2 });
  assert.equal(h.store.getState().takes[0].progress, 0.5);
  h.emit(ids[0], 'ready');
  assert.equal(h.store.getState().takes[0].assetUrl, '/fixture.mp4');
  assert.equal(h.store.getState().credits, 120);
});

test('buffers synchronous engine completion until queued takes are observable', () => {
  const h = harness({ synchronous: true });
  const snapshots = [];
  h.store.subscribe((state) => snapshots.push(state.takes.map((take) => take.status)));
  const ids = h.drafts();
  assert.deepEqual(snapshots[0], ['queued', 'queued', 'queued', 'queued']);
  assert.ok(h.store.getState().takes.every((take) => take.status === 'ready'));
  h.render(ids[0]);
  assert.equal(h.store.getState().credits, 116);
  assert.equal(h.store.getState().reservedCredits, 0);
});

test('charges successful render once and ignores late, duplicate, and regressive events', () => {
  const h = harness(); const [id] = h.drafts(); h.emit(id, 'ready');
  const renderId = h.render(id);
  assert.equal(h.store.getState().credits, 120);
  assert.equal(h.store.getState().reservedCredits, 4);
  h.emit(renderId, 'ready', { cost: 500, parentId: 'bad', prompt: 'bad' });
  h.emit(renderId, 'ready'); h.emit(renderId, 'failed'); h.emit(renderId, 'generating');
  const rendered = h.store.getState().takes.at(-1);
  assert.equal(rendered.parentId, id);
  assert.equal(rendered.prompt, 'A runner');
  assert.equal(rendered.cost, 4);
  assert.equal(rendered.status, 'ready');
  assert.equal(h.store.getState().credits, 116);
  assert.equal(h.store.getState().reservedCredits, 0);
});

test('reservations prevent concurrent overspending and release on failure', () => {
  const h = harness({ initialCredits: 6 }); const [a, b] = h.drafts();
  h.emit(a, 'ready'); h.emit(b, 'ready'); const job = h.render(a); h.render(b);
  assert.equal(h.store.getState().lastError.code, 'insufficient-credits');
  assert.equal(h.calls.filter((call) => call === 'render').length, 1);
  h.emit(job, 'failed', { error: 'Timed out' });
  assert.equal(h.store.getState().credits, 6);
  assert.equal(h.store.getState().reservedCredits, 0);
  const next = h.render(b); h.emit(next, 'ready');
  assert.equal(h.store.getState().credits, 2);
});

test('two affordable concurrent renders settle independently in reverse order', () => {
  const h = harness({ initialCredits: 8 }); const [a, b] = h.drafts();
  h.emit(a, 'ready'); h.emit(b, 'ready'); const x = h.render(a); const y = h.render(b);
  assert.equal(h.store.getState().reservedCredits, 8);
  h.emit(y, 'ready'); h.emit(x, 'ready');
  assert.equal(h.store.getState().credits, 0);
  assert.equal(h.store.getState().reservedCredits, 0);
});

test('failed render retries branch and remain free even if the engine quotes a charge', () => {
  const h = harness(); const [id] = h.drafts(); h.emit(id, 'ready');
  const failed = h.render(id); h.emit(failed, 'failed');
  h.store.getState().retry(failed);
  const retried = h.store.getState().takes.at(-1);
  assert.equal(retried.parentId, failed);
  assert.equal(retried.cost, 0);
  assert.equal(h.store.getState().reservedCredits, 0);
  h.emit(retried.id, 'ready');
  assert.equal(h.store.getState().credits, 120);
  assert.equal(h.store.getState().takes.find((take) => take.id === failed).status, 'failed');
});

test('remix, retry, and nudges preserve the source and branch their descendants', () => {
  const h = harness(); const [id, failed] = h.drafts(); h.emit(id, 'ready'); h.emit(failed, 'failed');
  const source = structuredClone(h.store.getState().takes[0]);
  h.store.getState().remix(id);
  assert.equal(h.store.getState().currentDraftIds.length, 4);
  assert.ok(h.store.getState().takes.slice(-4).every((take) => take.parentId === id));
  h.store.getState().applyNudge(id, 'too-fast');
  assert.equal(h.store.getState().takes.at(-1).intent.motion, 'too-fast');
  assert.equal(h.store.getState().takes.at(-1).parentId, id);
  assert.deepEqual(h.store.getState().takes[0], source);
  h.store.getState().retry(failed);
  assert.equal(h.store.getState().takes.at(-1).parentId, failed);
});

test('background completion does not steal current selection or draft batch', () => {
  const h = harness(); const old = h.drafts(); const current = h.drafts();
  h.store.getState().selectTake(current[1]); h.emit(old[0], 'ready');
  assert.deepEqual(h.store.getState().currentDraftIds, current);
  assert.equal(h.store.getState().activeTakeId, current[1]);
});

test('invalid actions and double clicks do not start new jobs', () => {
  const h = harness(); h.store.getState().render(); h.store.getState().retry('missing');
  h.store.getState().submitDraft('  ', intent);
  assert.equal(h.calls.length, 0);
  const [id] = h.drafts(); h.store.getState().remix(id); h.store.getState().retry(id);
  assert.equal(h.calls.length, 1);
  h.emit(id, 'ready'); h.render(id); h.render(id);
  assert.equal(h.calls.filter((call) => call === 'render').length, 1);
});

test('reset invalidates callbacks and restores the session balance', () => {
  const h = harness(); const [id] = h.drafts(); h.emit(id, 'ready'); const render = h.render(id);
  h.store.getState().reset(); const ids = h.drafts(); h.emit(render, 'ready'); h.emit(id, 'failed');
  assert.deepEqual(h.store.getState().currentDraftIds, ids);
  assert.equal(h.store.getState().takes.length, 4);
  assert.equal(h.store.getState().credits, 120);
  assert.equal(h.store.getState().reservedCredits, 0);
});

test('engine start failures expose state and cannot charge or insert ghost updates', () => {
  const h = harness(); const [id] = h.drafts(); h.emit(id, 'ready');
  let late;
  h.engine.renderFinal = (_, update) => { late = update; throw new Error('Offline'); };
  h.render(id); late({ id: 'ghost', status: 'ready' });
  assert.equal(h.store.getState().lastError.message, 'Offline');
  assert.equal(h.store.getState().takes.length, 4);
  assert.equal(h.store.getState().credits, 120);
  assert.equal(h.store.getState().reservedCredits, 0);
});

test('malformed quotes are rejected without invoking rendering', () => {
  for (const cost of [-1, NaN, Infinity]) {
    const h = harness({ cost }); const [id] = h.drafts(); h.emit(id, 'ready'); h.render(id);
    assert.equal(h.store.getState().lastError.code, 'engine-error');
    assert.equal(h.calls.includes('render'), false);
  }
});

test('rail walks ancestry while keeping sibling branches and failed history', () => {
  const takes = [
    { id: 'root', parentId: null }, { id: 'sibling', parentId: 'root' },
    { id: 'failed', parentId: 'root' }, { id: 'retry', parentId: 'failed' },
    { id: 'other-root', parentId: null },
  ];
  assert.deepEqual(deriveLineage(takes, 'retry').map((take) => take.id), ['root', 'failed', 'retry']);
  const rail = deriveRail(takes, 'retry');
  assert.deepEqual(rail.map((entry) => entry.depth), [0, 1, 1, 2, 0]);
  assert.deepEqual(rail.filter((entry) => entry.isAncestor).map((entry) => entry.take.id), ['root', 'failed']);
  assert.equal(rail.find((entry) => entry.take.id === 'retry').isActive, true);
  assert.equal(deriveRail([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }], 'a').length, 2);
});

function memoryStorage() {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

test('derived selectors preserve batch order and give stable rail snapshots', () => {
  const h = harness(); const ids = h.drafts();
  assert.deepEqual(selectDrafts(h.store.getState()).map((take) => take.id), ids);
  assert.equal(selectRail(h.store.getState()), selectRail(h.store.getState()));
  h.store.getState().selectTake(ids[0]);
  assert.equal(selectRail(h.store.getState())[0].isActive, true);
});

test('fallback engine integrates with the store and each nudge adjusts one parameter', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = createProjectStore(fallbackEngine);
  store.getState().submitDraft('A runner', intent);
  assert.ok(store.getState().takes.every((take) => take.status === 'queued'));
  t.mock.timers.tick(1000);
  assert.ok(store.getState().takes.every((take) => take.status === 'ready'));
  const id = store.getState().takes[0].id;
  for (const nudge of ['too-fast', 'too-slow', 'wrong-character', 'more-cinematic', 'less-busy']) {
    store.getState().applyNudge(id, nudge);
    const adjusted = store.getState().takes.at(-1);
    assert.equal(Object.keys(intent).filter((key) => intent[key] !== adjusted.intent[key]).length, 1);
    assert.equal(adjusted.parentId, id);
  }
  store.getState().selectTake(id); store.getState().render();
  t.mock.timers.tick(4000);
  assert.equal(store.getState().credits, 116);
  assert.equal(store.getState().reservedCredits, 0);
});

test('refresh preserves tree and credits and turns interrupted jobs into free recovery', () => {
  const storage = memoryStorage(); const h = harness({ storage }); const [id] = h.drafts();
  h.emit(id, 'ready'); const rendered = h.render(id);
  const restored = harness({ storage });
  assert.equal(restored.store.getState().credits, 120);
  assert.equal(restored.store.getState().reservedCredits, 0);
  assert.equal(restored.store.getState().activeTakeId, rendered);
  assert.equal(restored.store.getState().takes.at(-1).status, 'failed');
  assert.equal(restored.store.getState().takes.at(-1).parentId, id);
  assert.match(restored.store.getState().takes.at(-1).error, /Reroll for free/);
  h.store.getState().reset();
  assert.equal(harness({ storage }).store.getState().takes.length, 0);
});

test('completed charges survive hydration without being charged twice', () => {
  const storage = memoryStorage(); const h = harness({ storage }); const [id] = h.drafts();
  h.emit(id, 'ready'); h.emit(h.render(id), 'ready');
  assert.equal(harness({ storage }).store.getState().credits, 116);
});

test('malformed, cyclic and unavailable storage cannot break the session', () => {
  const storage = memoryStorage();
  for (const raw of ['{bad', 'null', JSON.stringify({ version: 99, state: {} })]) {
    storage.setItem(SESSION_KEY, raw); assert.equal(readSession(storage), undefined);
  }
  const h = harness({ storage }); h.drafts();
  const data = JSON.parse(storage.getItem(SESSION_KEY));
  data.state.takes[0].parentId = data.state.takes[0].id;
  storage.setItem(SESSION_KEY, JSON.stringify(data)); assert.equal(readSession(storage), undefined);
  const denied = harness({ storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } } });
  assert.doesNotThrow(() => denied.drafts());
});
