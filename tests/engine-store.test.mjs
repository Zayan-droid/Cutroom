import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockEngine } from '../src/engine/mockEngine.ts';
import { createProjectStore } from '../src/store/projectStore.ts';

const intent = { kind: 'cinematic', subject: 'coast', style: 'film', motion: 'pan', mood: 'calm' };

test('real engine progress, quotes and assets settle through the store', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = createProjectStore(createMockEngine({ seed: 'integration', outcome: 'success' }));
  store.getState().submitDraft('A quiet coastline', intent);
  assert.equal(store.getState().takes.length, 4);
  assert.ok(store.getState().takes.every((take) => take.status === 'queued'));
  t.mock.timers.tick(3000);
  const source = store.getState().takes[0];
  store.getState().selectTake(source.id);
  store.getState().render();
  assert.equal(store.getState().reservedCredits, 8);
  assert.equal(store.getState().credits, 120);
  t.mock.timers.tick(1000);
  const generating = store.getState().takes.at(-1);
  assert.equal(generating.status, 'generating');
  assert.ok(generating.progress > 0 && generating.progress < 1);
  t.mock.timers.tick(9000);
  const rendered = store.getState().takes.at(-1);
  assert.equal(rendered.status, 'ready');
  assert.equal(rendered.progress, 1);
  assert.equal(rendered.parentId, source.id);
  assert.match(rendered.assetUrl, /render\.mp4$/);
  assert.equal(store.getState().credits, 112);
  assert.equal(store.getState().reservedCredits, 0);
});

test('a real failed render releases its reservation and its successful reroll stays free', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const success = createMockEngine({ seed: 'recovery', outcome: 'success' });
  const failure = createMockEngine({ seed: 'recovery', outcome: 'failure' });
  // Force only the render operation to fail; recovery uses the success instance.
  const store = createProjectStore({ ...success, renderFinal: failure.renderFinal });
  store.getState().submitDraft('A quiet coastline', intent);
  t.mock.timers.tick(3000);
  store.getState().selectTake(store.getState().takes[0].id);
  store.getState().render();
  t.mock.timers.tick(10000);
  const failed = store.getState().takes.at(-1);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /free/);
  assert.equal(store.getState().credits, 120);
  assert.equal(store.getState().reservedCredits, 0);
  store.getState().retry(failed.id);
  assert.equal(store.getState().takes.at(-1).cost, 0);
  t.mock.timers.tick(10000);
  const recovered = store.getState().takes.at(-1);
  assert.equal(recovered.parentId, failed.id);
  assert.equal(recovered.kind, 'render');
  assert.equal(recovered.status, 'ready');
  assert.equal(store.getState().credits, 120);
  assert.equal(store.getState().reservedCredits, 0);
  assert.equal(store.getState().takes.find((take) => take.id === failed.id).status, 'failed');
});
