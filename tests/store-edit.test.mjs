import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore } from '../src/store/projectStore.ts';
import { readSession, writeSession, SESSION_KEY } from '../src/store/persist.ts';
import { selectDrafts, selectRail } from '../src/store/selectors.ts';
import { createRecipe } from '../src/edit/recipe.ts';

// Edits are free, instant versions: the store branches them from a ready take
// without an engine job, and they survive a refresh like any other take.

const intent = { kind: 'cinematic', subject: 'coast', style: 'film', motion: 'pan', mood: 'calm' };
const cropped = { ...createRecipe(), crop: { x: 0.25, y: 0, width: 0.5, height: 1 }, frame: '9:16' };

/** A store whose engine finishes every job synchronously with a real-looking asset. */
function harness(options = {}) {
  let serial = 0;
  const calls = [];
  const make = (input, update) => {
    const take = {
      id: `t${++serial}`, parentId: null, kind: 'draft', status: 'queued', prompt: 'A quiet coastline',
      intent: { ...intent }, cost: 0, createdAt: serial, ...input,
    };
    if (!options.pending) {
      update({ ...take, status: options.fail ? 'failed' : 'ready', assetUrl: options.asset ?? `/clips/${take.id}.mp4`, error: options.fail ? 'Nope.' : undefined });
    }
    return take;
  };
  const engine = {
    quote: (kind) => (kind === 'render' ? 8 : 0),
    generateDraft(input, update) { calls.push('draft'); return Array.from({ length: 4 }, () => make({}, update)); },
    renderFinal({ source }, update) { calls.push('render'); return make({ id: `r${++serial}`, kind: 'render', label: 'Render', prompt: source.prompt }, update); },
    remix({ source }, update) { calls.push('remix'); return Array.from({ length: 4 }, () => make({ prompt: source.prompt }, update)); },
    retry({ failed }, update) { calls.push('retry'); return make({ kind: failed.kind }, update); },
    nudge({ source }, update) { calls.push('nudge'); return make({ prompt: source.prompt }, update); },
  };
  const store = createProjectStore(engine, options);
  store.getState().submitDraft('A quiet coastline', intent);
  return { store, calls, drafts: store.getState().currentDraftIds };
}

function memoryStorage() {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

test('an edit branches a free, ready version from its source and becomes active', () => {
  const h = harness();
  const source = h.store.getState().takes[1];
  const before = h.calls.length;
  const id = h.store.getState().applyEdit(source.id, cropped);
  const state = h.store.getState();
  const edit = state.takes.at(-1);
  assert.equal(id, edit.id);
  assert.equal(h.calls.length, before, 'no engine job runs');
  assert.deepEqual(
    { kind: edit.kind, status: edit.status, parentId: edit.parentId, cost: edit.cost, label: edit.label, progress: edit.progress },
    { kind: 'edit', status: 'ready', parentId: source.id, cost: 0, label: 'Edit', progress: 1 },
  );
  assert.equal(edit.assetUrl, source.assetUrl, 'the source picture is left untouched');
  assert.equal(edit.prompt, source.prompt);
  assert.deepEqual(edit.intent, source.intent);
  assert.notEqual(edit.intent, source.intent);
  assert.deepEqual(edit.edit, cropped);
  assert.notEqual(edit.edit, cropped, 'the recipe is copied, not shared');
  assert.equal(state.activeTakeId, edit.id);
  assert.equal(state.credits, 120);
  assert.equal(state.reservedCredits, 0);
  assert.deepEqual(selectDrafts(state).map((take) => take.id), h.drafts, 'the draft grid is unchanged');
  assert.equal(state.lastError, null);
});

test('edits of edits point at the original picture and nest in history', () => {
  const h = harness();
  const source = h.store.getState().takes[0];
  const first = h.store.getState().applyEdit(source.id, cropped);
  const second = h.store.getState().applyEdit(first, { ...cropped, upscale: '4k' });
  const takes = h.store.getState().takes;
  const edit = takes.find((take) => take.id === second);
  assert.equal(edit.parentId, first);
  assert.equal(edit.assetUrl, source.assetUrl);
  const rail = selectRail(h.store.getState());
  const depth = Object.fromEntries(rail.map((entry) => [entry.take.id, entry.depth]));
  assert.deepEqual([depth[source.id], depth[first], depth[second]], [0, 1, 2]);
  assert.equal(rail.find((entry) => entry.take.id === second).isActive, true);
});

test('edits cannot be rendered, but can be remixed into new drafts', () => {
  const h = harness();
  const id = h.store.getState().applyEdit(h.drafts[0], cropped);
  h.store.getState().render();
  assert.equal(h.store.getState().lastError.code, 'invalid-take');
  assert.ok(!h.calls.includes('render'));
  h.store.getState().remix(id);
  const drafts = selectDrafts(h.store.getState());
  assert.equal(drafts.length, 4);
  assert.ok(drafts.every((take) => take.parentId === id));
});

test('invalid edits explain themselves and save nothing', () => {
  const cases = [
    [harness(), (h) => h.store.getState().applyEdit('missing', cropped), 'invalid-take'],
    [harness({ pending: true }), (h) => h.store.getState().applyEdit(h.drafts[0], cropped), 'invalid-take'],
    [harness({ fail: true }), (h) => h.store.getState().applyEdit(h.drafts[0], cropped), 'invalid-take'],
    [harness({ asset: 'placeholder://x' }), (h) => h.store.getState().applyEdit(h.drafts[0], cropped), 'invalid-take'],
    [harness(), (h) => h.store.getState().applyEdit(h.drafts[0], { ...cropped, frame: '3:2' }), 'invalid-input'],
    [harness(), (h) => h.store.getState().applyEdit(h.drafts[0], createRecipe()), 'invalid-input'],
  ];
  for (const [h, act, code] of cases) {
    const count = h.store.getState().takes.length;
    assert.equal(act(h), null);
    assert.equal(h.store.getState().lastError.code, code);
    assert.equal(h.store.getState().takes.length, count);
  }
  const h = harness();
  h.store.getState().applyEdit('missing', cropped);
  h.store.getState().applyEdit(h.drafts[0], cropped);
  assert.equal(h.store.getState().lastError, null, 'a successful edit clears the last error');
});

test('edits survive a refresh with their recipe intact', () => {
  const storage = memoryStorage();
  const h = harness({ storage });
  const id = h.store.getState().applyEdit(h.drafts[2], { ...cropped, trim: { start: 0.5, end: 2 } });
  const restored = createProjectStore({ quote: () => 0 }, { storage }).getState();
  const edit = restored.takes.find((take) => take.id === id);
  assert.equal(edit.kind, 'edit');
  assert.deepEqual(edit.edit, { ...cropped, trim: { start: 0.5, end: 2 } });
  assert.equal(restored.activeTakeId, id);
});

test('session restore rejects malformed edits instead of guessing', () => {
  const storage = memoryStorage();
  const h = harness({ storage });
  h.store.getState().applyEdit(h.drafts[0], cropped);
  const saved = JSON.parse(storage.getItem(SESSION_KEY));
  assert.ok(readSession(storage), 'a valid session restores');
  const variants = [
    (takes) => { takes.at(-1).edit = { ...takes.at(-1).edit, upscale: '16k' }; },
    (takes) => { delete takes.at(-1).edit; },
    (takes) => { takes.at(-1).status = 'generating'; },
    (takes) => { takes[0].edit = cropped; },
  ];
  for (const change of variants) {
    const copy = structuredClone(saved);
    change(copy.state.takes);
    storage.setItem(SESSION_KEY, JSON.stringify(copy));
    assert.equal(readSession(storage), undefined);
  }
  // Slightly-off numbers are clamped rather than costing the whole history.
  const nudged = structuredClone(saved);
  nudged.state.takes.at(-1).edit.crop.x = 0.9;
  storage.setItem(SESSION_KEY, JSON.stringify(nudged));
  assert.equal(readSession(storage).takes.at(-1).edit.crop.x, 0.5);
  writeSession(storage, h.store.getState());
  assert.ok(readSession(storage));
});
