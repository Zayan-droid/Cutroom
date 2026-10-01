import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockEngine, mockEngine, resolveEngineOptions } from '../src/engine/mockEngine.ts';

const intent = { kind: 'social', subject: 'runner', style: 'film', motion: 'tracking', mood: 'calm' };
const prompt = 'A runner on a quiet city street';
const nudges = ['too-fast', 'too-slow', 'wrong-character', 'more-cinematic', 'less-busy'];

function source(overrides = {}) {
  return {
    id: 'source', parentId: 'earlier-take', kind: 'draft', status: 'ready', prompt,
    intent: { ...intent }, assetUrl: '/old-source.mp4', progress: 1, cost: 0,
    createdAt: 100, ...overrides,
  };
}

function freeze(take) {
  Object.freeze(take.intent);
  return Object.freeze(take);
}

function clock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
}

function advance(t, milliseconds, step = 10) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += step) {
    t.mock.timers.tick(Math.min(step, milliseconds - elapsed));
  }
}

function capture() {
  const updates = [];
  return { updates, update(take) { updates.push({ take, snapshot: structuredClone(take), at: Date.now() }); } };
}

function assertLifecycle(queued, updates, outcome) {
  const history = updates.filter(({ take }) => take.id === queued.id);
  assert.ok(history.length >= 2, 'Every job reports generating before its terminal update');
  assert.equal(history[0].take.status, 'generating');
  assert.equal(history.at(-1).take.status, outcome === 'success' ? 'ready' : 'failed');
  assert.ok(history.slice(0, -1).every(({ take }) => take.status === 'generating'));
  assert.equal(new Set([queued, ...history.map(({ take }) => take)]).size, history.length + 1,
    'Each callback must receive a new snapshot');
  for (const { take, snapshot } of history) {
    assert.deepEqual(take, snapshot, 'Later events must not mutate earlier snapshots');
    for (const key of ['id', 'parentId', 'kind', 'prompt', 'cost', 'createdAt']) {
      assert.equal(take[key], queued[key], `${key} remains stable for a job`);
    }
    assert.deepEqual(take.intent, queued.intent);
    assert.notStrictEqual(take.intent, queued.intent);
  }
  const generating = history.filter(({ take }) => take.status === 'generating').map(({ take }) => take);
  if (queued.kind === 'render') assert.ok(generating.length >= 3, 'Renders expose multiple progress ticks');
  for (let i = 0; i < generating.length; i++) {
    assert.ok(Number.isFinite(generating[i].progress));
    assert.ok(generating[i].progress >= 0 && generating[i].progress < 1);
    if (i) assert.ok(generating[i].progress > generating[i - 1].progress, 'Progress moves forward');
    assert.equal(generating[i].assetUrl, undefined);
    assert.equal(generating[i].error, undefined);
  }
  const terminal = history.at(-1).take;
  if (outcome === 'success') {
    assert.equal(terminal.progress, 1);
    assert.ok(terminal.assetUrl && !terminal.assetUrl.startsWith('placeholder://'));
    assert.equal(terminal.error, undefined);
  } else {
    assert.equal(terminal.assetUrl, undefined);
    assert.equal(typeof terminal.error, 'string');
    assert.ok(terminal.error.trim().length >= 15, 'Failure explains what happened in human language');
  }
  return terminal;
}

const scenarios = [
  { name: 'generateDraft roots', count: 4, parentId: null, kind: 'draft', cost: 0,
    run: (engine, take, update) => engine.generateDraft({ prompt, intent: take.intent, parentId: null }, update) },
  { name: 'generateDraft branch', count: 4, parentId: 'source', kind: 'draft', cost: 0,
    run: (engine, take, update) => engine.generateDraft({ prompt, intent: take.intent, parentId: take.id }, update) },
  { name: 'renderFinal', count: 1, parentId: 'source', kind: 'render', cost: 4,
    run: (engine, take, update) => [engine.renderFinal({ source: take }, update)] },
  { name: 'remix', count: 4, parentId: 'source', kind: 'draft', cost: 0,
    source: { kind: 'render', cost: 4 },
    run: (engine, take, update) => engine.remix({ source: take }, update) },
  ...['draft', 'render'].map((kind) => ({
    name: `retry failed ${kind}`, count: 1, parentId: 'source', kind, cost: 0,
    source: { kind, status: 'failed', error: 'The previous job failed.', assetUrl: undefined, cost: kind === 'render' ? 4 : 0 },
    run: (engine, take, update) => [engine.retry({ failed: take }, update)],
  })),
  ...nudges.map((nudge) => ({
    name: `nudge ${nudge}`, count: 1, parentId: 'source', kind: 'draft', cost: 0, nudge,
    source: { status: 'failed', error: 'The previous job failed.', assetUrl: undefined },
    run: (engine, take, update) => [engine.nudge({ source: take, nudge }, update)],
  })),
];

for (const outcome of ['success', 'failure']) {
  for (const scenario of scenarios) {
    test(`${scenario.name} returns queued immediately and finishes with ${outcome}`, (t) => {
      clock(t);
      const engine = createMockEngine({ seed: 'lifecycle', outcome });
      const original = freeze(source(scenario.source));
      const before = structuredClone(original);
      const { updates, update } = capture();
      const queued = scenario.run(engine, original, update);
      const initial = structuredClone(queued);
      assert.equal(updates.length, 0, 'The store can insert all queued takes before any callback');
      assert.equal(queued.length, scenario.count);
      assert.equal(new Set(queued.map((take) => take.id)).size, queued.length);
      for (const take of queued) {
        assert.equal(take.status, 'queued');
        assert.notEqual(take.id, original.id);
        assert.equal(take.parentId, scenario.parentId);
        assert.equal(take.kind, scenario.kind);
        assert.equal(take.cost, scenario.cost);
        assert.equal(take.prompt, prompt);
        assert.equal(take.assetUrl, undefined);
        assert.equal(take.error, undefined);
        assert.notStrictEqual(take.intent, original.intent);
        const changed = Object.keys(intent).filter((key) => take.intent[key] !== original.intent[key]);
        assert.equal(changed.length, scenario.nudge ? 1 : 0);
        assert.equal(take.intent.kind, original.intent.kind);
      }
      t.mock.timers.tick(10_000);
      for (const take of queued) assertLifecycle(take, updates, outcome);
      assert.deepEqual(original, before, 'Branching never mutates its source');
      assert.deepEqual(queued, initial, 'Returned queued takes remain immutable snapshots');
      const count = updates.length;
      t.mock.timers.tick(20_000);
      assert.equal(updates.length, count, 'Terminal jobs stop emitting');
    });
  }
}

test('quote is synchronous, free for drafts, and reflects each render intent', () => {
  const engine = createMockEngine({ seed: 7 });
  for (const [kind, cost] of Object.entries({ social: 4, ad: 6, cinematic: 8 })) {
    const input = Object.freeze({ ...intent, kind });
    assert.equal(engine.quote('draft', input), 0);
    assert.equal(engine.quote('render', input), cost);
    assert.equal(engine.quote('render', input), cost);
    assert.equal(mockEngine.quote('render', input), cost);
  }
});

test('default jobs spend time queued and finish within the documented latency windows', (t) => {
  clock(t);
  const engine = createMockEngine({ seed: 'timing', outcome: 'success' });
  const { updates, update } = capture();
  const started = Date.now();
  const jobs = [];
  for (const kind of ['social', 'ad', 'cinematic']) {
    const input = { ...intent, kind };
    jobs.push(...engine.generateDraft({ prompt, intent: input, parentId: null }, update));
    jobs.push(engine.renderFinal({ source: source({ intent: input }) }, update));
  }
  assert.equal(updates.length, 0);
  advance(t, 10_000);
  const draftTimes = [];
  for (const job of jobs) {
    const events = updates.filter(({ take }) => take.id === job.id);
    assert.ok(events[0].at > started, 'Queue is observable for a nonzero interval');
    const elapsed = events.at(-1).at - started;
    const [min, max] = job.kind === 'draft' ? [1000, 3000] : [5000, 10_000];
    assert.ok(elapsed >= min && elapsed <= max, `${job.kind} took ${elapsed}ms`);
    if (job.kind === 'draft') draftTimes.push(elapsed);
  }
  assert.ok(new Set(draftTimes).size > 1, 'Draft reveals are staggered');
});

function replay(t, { seed = 'reproducible-demo', timeScale = 1, quotes = false } = {}) {
  const engine = createMockEngine({ seed, timeScale });
  const started = Date.now();
  const jobs = [];
  const { updates, update } = capture();
  for (let i = 0; i < 8; i++) {
    const input = { ...intent, kind: ['social', 'ad', 'cinematic'][i % 3] };
    if (quotes) {
      engine.quote('render', input);
      engine.quote('draft', input);
    }
    jobs.push(...engine.generateDraft({ prompt, intent: input, parentId: null }, update));
    jobs.push(engine.renderFinal({ source: source({ intent: input }) }, update));
  }
  advance(t, 10_000 * timeScale, 1);
  return jobs.map((job) => updates.filter(({ take }) => take.id === job.id).map(({ take, at }) => ({
    at: at - started, status: take.status, progress: take.progress,
    assetUrl: take.assetUrl, error: take.error, cost: take.cost,
  })));
}

test('seeds reproduce timing, failures, assets, and progress; quotes do not consume randomness', (t) => {
  clock(t);
  const first = replay(t);
  assert.deepEqual(replay(t), first);
  assert.deepEqual(replay(t, { quotes: true }), first);
  assert.notDeepEqual(replay(t, { seed: 'another-demo' }), first);
  const outcomes = new Set(first.map((events) => events.at(-1).status));
  assert.deepEqual(outcomes, new Set(['ready', 'failed']));
});

test('timeScale accelerates queue, progress, and completion together', (t) => {
  clock(t);
  const normal = replay(t);
  const faster = replay(t, { timeScale: 0.1 });
  for (let i = 0; i < normal.length; i++) {
    assert.equal(faster[i].length, normal[i].length);
    for (let j = 0; j < normal[i].length; j++) {
      const { at: normalAt, ...normalEvent } = normal[i][j];
      const { at: fasterAt, ...fasterEvent } = faster[i][j];
      assert.deepEqual(fasterEvent, normalEvent);
      assert.ok(Math.abs(fasterAt - normalAt * 0.1) <= 1, 'All event timing scales within timer precision');
    }
  }
});

test('zero timeScale still delivers queued takes before asynchronous updates', (t) => {
  clock(t);
  const engine = createMockEngine({ seed: 0, outcome: 'success', timeScale: 0 });
  const { updates, update } = capture();
  const jobs = engine.generateDraft({ prompt, intent, parentId: null }, update);
  assert.equal(updates.length, 0);
  t.mock.timers.tick(1);
  for (const job of jobs) assertLifecycle(job, updates, 'success');
});

test('fixed random sample injects roughly one failure per eight jobs', (t) => {
  clock(t);
  const engine = createMockEngine({ seed: 'failure-distribution' });
  let failures = 0;
  let terminals = 0;
  const update = (take) => {
    if (take.status === 'failed') failures++;
    if (take.status === 'failed' || take.status === 'ready') terminals++;
  };
  for (let i = 0; i < 256; i++) engine.generateDraft({ prompt, intent, parentId: null }, update);
  t.mock.timers.tick(3000);
  assert.equal(terminals, 1024);
  assert.ok(failures >= 87 && failures <= 169, `Fixed sample failed ${failures}/1024 jobs`);
});

test('input, returned takes, and callback snapshots cannot alter an in-flight job', (t) => {
  clock(t);
  const engine = createMockEngine({ seed: 3, outcome: 'success' });
  const input = { prompt, intent: { ...intent }, parentId: null };
  const received = [];
  const jobs = engine.generateDraft(input, (take) => {
    received.push(structuredClone(take));
    if (!Object.isFrozen(take.intent)) take.intent.subject = 'mutated callback';
    if (!Object.isFrozen(take)) take.prompt = 'mutated callback';
  });
  input.intent.subject = 'mutated input';
  input.prompt = 'mutated input';
  if (!Object.isFrozen(jobs[0].intent)) jobs[0].intent.subject = 'mutated return';
  if (!Object.isFrozen(jobs[0])) jobs[0].prompt = 'mutated return';
  assert.equal(new Set(jobs.map((take) => take.intent)).size, 4);
  t.mock.timers.tick(3000);
  assert.equal(received.filter((take) => take.status === 'ready').length, 4);
  assert.ok(received.every((take) => take.prompt === prompt));
  assert.ok(received.every((take) => take.intent.subject === intent.subject));
});

test('repeated corrective nudges each adjust exactly one parameter and preserve ancestry', (t) => {
  clock(t);
  const engine = createMockEngine({ outcome: 'success', timeScale: 0 });
  for (const nudge of nudges) {
    let previous = freeze(source());
    for (let i = 0; i < 3; i++) {
      let ready;
      const queued = engine.nudge({ source: previous, nudge }, (take) => {
        if (take.status === 'ready') ready = take;
      });
      assert.equal(queued.parentId, previous.id);
      assert.equal(Object.keys(intent).filter((key) => queued.intent[key] !== previous.intent[key]).length, 1);
      assert.equal(queued.intent.kind, previous.intent.kind);
      t.mock.timers.tick(1);
      assert.ok(ready);
      previous = freeze(ready);
    }
  }
});

test('invalid source states reject synchronously without scheduling ghost jobs', (t) => {
  clock(t);
  const engine = createMockEngine({ outcome: 'success' });
  const { updates, update } = capture();
  for (const status of ['queued', 'generating', 'failed']) {
    assert.throws(() => engine.renderFinal({ source: source({ status }) }, update));
  }
  assert.throws(() => engine.renderFinal({ source: source({ kind: 'render' }) }, update));
  for (const status of ['queued', 'generating', 'failed']) {
    assert.throws(() => engine.remix({ source: source({ status }) }, update));
  }
  for (const status of ['queued', 'generating', 'ready']) {
    assert.throws(() => engine.retry({ failed: source({ status }) }, update));
  }
  for (const status of ['queued', 'generating']) {
    assert.throws(() => engine.nudge({ source: source({ status }), nudge: 'too-fast' }, update));
  }
  t.mock.timers.tick(10_000);
  assert.equal(updates.length, 0);
});

test('invalid demo options reject instead of silently changing scheduling or failure behavior', () => {
  for (const timeScale of [-1, NaN, Infinity, -Infinity, 1_000_000]) {
    assert.throws(() => createMockEngine({ timeScale }));
  }
  for (const outcome of ['', 'fail', 'always-ready']) assert.throws(() => createMockEngine({ outcome }));
});

test('env wiring treats a blank var as unset, not as a fixed seed / instant / crash', () => {
  // Nothing set → all defaults.
  assert.deepEqual(resolveEngineOptions(undefined), { seed: undefined, outcome: undefined, timeScale: undefined });
  assert.deepEqual(resolveEngineOptions({}), { seed: undefined, outcome: undefined, timeScale: undefined });

  // Declared-but-blank / whitespace → unset (Vite exposes `KEY=` as '').
  assert.deepEqual(
    resolveEngineOptions({ VITE_MOCK_ENGINE_SEED: '', VITE_MOCK_ENGINE_OUTCOME: '   ', VITE_MOCK_ENGINE_TIME_SCALE: '' }),
    { seed: undefined, outcome: undefined, timeScale: undefined },
  );

  // Valid values pass through untouched.
  assert.deepEqual(
    resolveEngineOptions({ VITE_MOCK_ENGINE_SEED: 'demo', VITE_MOCK_ENGINE_OUTCOME: 'failure', VITE_MOCK_ENGINE_TIME_SCALE: '0.1' }),
    { seed: 'demo', outcome: 'failure', timeScale: 0.1 },
  );

  // Blank outcome/timeScale must NOT crash and must NOT collapse timing to 0.
  assert.doesNotThrow(() =>
    createMockEngine(resolveEngineOptions({ VITE_MOCK_ENGINE_OUTCOME: '', VITE_MOCK_ENGINE_TIME_SCALE: '' })),
  );

  // A genuine non-empty typo still fails loudly (fail-fast is intended).
  assert.throws(() => createMockEngine(resolveEngineOptions({ VITE_MOCK_ENGINE_OUTCOME: 'succeed' })));
  assert.throws(() => createMockEngine(resolveEngineOptions({ VITE_MOCK_ENGINE_TIME_SCALE: 'fast' })));
});

test('separately seeded engines still allocate unique takes for the shared project tree', (t) => {
  clock(t);
  const first = createMockEngine({ seed: 123 });
  const second = createMockEngine({ seed: 123 });
  const jobs = [first, second].flatMap((engine) =>
    engine.generateDraft({ prompt, intent, parentId: null }, () => {}));
  assert.equal(new Set(jobs.map((take) => take.id)).size, jobs.length);
});

test('ready assets are bundled MP4 media, grouped by intent and quality', (t) => {
  clock(t);
  const engine = createMockEngine({ seed: 'assets', outcome: 'success' });
  const { updates, update } = capture();
  for (const kind of ['social', 'ad', 'cinematic']) {
    engine.generateDraft({ prompt, intent: { ...intent, kind }, parentId: null }, update);
  }
  t.mock.timers.tick(3000);
  const drafts = updates.filter(({ take }) => take.status === 'ready').map(({ take }) => take);
  assert.equal(drafts.length, 12);
  for (const take of drafts) engine.renderFinal({ source: take }, update);
  t.mock.timers.tick(10_000);
  const ready = updates.filter(({ take }) => take.status === 'ready').map(({ take }) => take);
  assert.equal(ready.length, 24);
  assert.equal(new Set(ready.map((take) => take.assetUrl)).size, 24, 'Each batch has four distinct placeholders per quality');
  for (const take of ready) {
    const url = new URL(take.assetUrl);
    assert.equal(url.protocol, 'file:', 'Assets are bundled and work without third-party requests');
    const bytes = readFileSync(url);
    assert.equal(bytes.toString('ascii', 4, 8), 'ftyp', 'Asset has an MP4 container signature');
    assert.ok(bytes.length > 1000, 'Asset contains actual media data');
    assert.ok(bytes.includes(Buffer.from('moov')));
    assert.ok(bytes.includes(Buffer.from('mdat')));
    if (take.kind === 'render') {
      const draft = drafts.find((item) => item.id === take.parentId);
      assert.ok(draft);
      assert.notEqual(take.assetUrl, draft.assetUrl, 'Renders use the distinct full-resolution asset');
      assert.equal(take.assetUrl, draft.assetUrl.replace('-draft.mp4', '-render.mp4'),
        'Rendering preserves the selected draft scene and variant');
    }
  }
});
