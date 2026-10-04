import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, createStoryEngine } from '../src/story/storyEngine.ts';
import { toVtt } from '../src/story/subtitles.ts';
import { LANGUAGES } from '../src/story/localize.ts';
import { selectVoice } from '../src/story/voices.ts';
import { extractSubject } from '../src/story/grammar.ts';
import { createStoryStore } from '../src/store/storyStore.ts';

const prompt = 'a lonely lighthouse keeper';
const THREE_MIN = 180_000;

function clock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
}

test('buildTimeline is deterministic for the same prompt + seed, and varies otherwise', () => {
  const input = { prompt, lang: 'en-US', targetMs: THREE_MIN };
  const first = buildTimeline(input, { idPrefix: 'fixed' });
  assert.deepEqual(buildTimeline(input, { idPrefix: 'fixed' }), first);
  assert.notDeepEqual(buildTimeline({ ...input, prompt: 'a brave astronaut' }, { idPrefix: 'fixed' }), first);
  assert.notDeepEqual(buildTimeline(input, { idPrefix: 'fixed', seed: 'other' }), first);
});

test('scenes tile the whole target duration with no gaps or overlaps', () => {
  for (const lang of LANGUAGES) {
    const timeline = buildTimeline({ prompt, lang, targetMs: THREE_MIN }, { idPrefix: 't' });
    assert.ok(timeline.scenes.length >= 4, `${lang} produced scenes`);
    assert.equal(timeline.scenes[0].startMs, 0);
    let total = 0;
    timeline.scenes.forEach((scene, i) => {
      assert.ok(scene.durationMs > 0);
      if (i > 0) {
        const prev = timeline.scenes[i - 1];
        assert.equal(scene.startMs, prev.startMs + prev.durationMs, `${lang} scenes are contiguous`);
      }
      total += scene.durationMs;
    });
    assert.equal(total, timeline.totalMs);
    assert.ok(Math.abs(timeline.totalMs - THREE_MIN) <= 5, `${lang} lands on ~3:00 (${timeline.totalMs}ms)`);
  }
});

test('every dialogue cue sits inside its scene, in the chosen language, and never overlaps', () => {
  for (const lang of LANGUAGES) {
    const timeline = buildTimeline({ prompt, lang, targetMs: THREE_MIN }, { idPrefix: 'c' });
    assert.ok(timeline.dialogue.length >= timeline.scenes.length);
    timeline.dialogue.forEach((cue, i) => {
      const scene = timeline.scenes.find((s) => s.id === cue.sceneId);
      assert.ok(scene, 'cue belongs to a scene');
      assert.equal(cue.lang, lang);
      assert.ok(cue.text.trim().length > 0);
      assert.ok(cue.durationMs > 0);
      assert.ok(cue.startMs >= scene.startMs);
      assert.ok(cue.startMs + cue.durationMs <= scene.startMs + scene.durationMs, 'cue fits its scene');
      if (i > 0) {
        const prev = timeline.dialogue[i - 1];
        assert.ok(cue.startMs >= prev.startMs + prev.durationMs, 'cues never overlap');
      }
      assert.ok(cue.visemes.length >= 1);
      assert.equal(cue.visemes.at(-1).viseme, 'rest', 'lip-sync returns to rest');
      assert.ok(cue.visemes.every((mark) => mark.atMs >= 0 && mark.atMs <= cue.durationMs));
    });
    assert.ok(timeline.dialogue.some((cue) => cue.speaker === 'hero'), 'the character speaks');
    assert.ok(timeline.dialogue.some((cue) => cue.speaker === 'narrator'), 'the narrator speaks');
  }
});

test('subtitles mirror the dialogue one-to-one and serialize to valid WebVTT', () => {
  const timeline = buildTimeline({ prompt, lang: 'en-US', targetMs: THREE_MIN }, { idPrefix: 'sub' });
  assert.equal(timeline.subtitles.length, timeline.dialogue.length);
  for (const sub of timeline.subtitles) {
    const cue = timeline.dialogue.find((c) => c.id === sub.cueId);
    assert.ok(cue, 'subtitle references a real cue');
    assert.equal(sub.text, cue.text);
    assert.equal(sub.startMs, cue.startMs);
    assert.ok(sub.endMs > sub.startMs);
  }
  const vtt = toVtt(timeline);
  assert.ok(vtt.startsWith('WEBVTT'));
  assert.equal((vtt.match(/-->/g) ?? []).length, timeline.subtitles.length);
  assert.match(vtt, /\d\d:\d\d:\d\d\.\d\d\d --> \d\d:\d\d:\d\d\.\d\d\d/);
});

test('localization produces different scaffolding per language but keeps the subject', () => {
  assert.deepEqual([...LANGUAGES].sort(), ['de-DE', 'en-US', 'es-ES', 'fr-FR', 'pt-BR']);
  const en = buildTimeline({ prompt, lang: 'en-US', targetMs: THREE_MIN }, { idPrefix: 'x' });
  const es = buildTimeline({ prompt, lang: 'es-ES', targetMs: THREE_MIN }, { idPrefix: 'x' });
  assert.notEqual(en.dialogue[0].text, es.dialogue[0].text);
  assert.ok(en.title.toLowerCase().includes('lighthouse'));
  assert.ok(es.title.toLowerCase().includes('lighthouse'));
  assert.ok(en.dialogue.some((cue) => cue.text.toLowerCase().includes('lighthouse')));
});

test('buildTimeline rejects an empty prompt and an unsupported language', () => {
  assert.throws(() => buildTimeline({ prompt: '   ', lang: 'en-US' }, { idPrefix: 'x' }));
  assert.throws(() => buildTimeline({ prompt, lang: 'zz-ZZ' }, { idPrefix: 'x' }));
});

test('quote is synchronous, scales with length, and defaults to the 3-minute price', () => {
  const engine = createStoryEngine({ seed: 1 });
  const three = engine.quote({ prompt, lang: 'en-US', targetMs: THREE_MIN });
  const one = engine.quote({ prompt, lang: 'en-US', targetMs: 60_000 });
  assert.ok(Number.isFinite(three) && three > 0);
  assert.ok(three > one);
  assert.equal(engine.quote({ prompt, lang: 'en-US' }), three, 'omitting targetMs quotes a 3-minute story');
});

test('compose returns a storyboard immediately and fills it on ready', (t) => {
  clock(t);
  const engine = createStoryEngine({ seed: 'demo', outcome: 'success' });
  const updates = [];
  const skeleton = engine.compose(
    { prompt, lang: 'en-US', targetMs: THREE_MIN },
    (timeline) => updates.push({ timeline, snapshot: structuredClone(timeline) }),
  );
  assert.equal(updates.length, 0, 'the store can insert the skeleton before any callback');
  assert.equal(skeleton.status, 'queued');
  assert.ok(skeleton.scenes.length > 0, 'storyboard is visible immediately');
  assert.equal(skeleton.dialogue.length, 0, 'script is withheld until ready');
  assert.equal(skeleton.subtitles.length, 0);

  t.mock.timers.tick(10_000);
  assert.ok(updates.some((u) => u.timeline.status === 'composing'), 'progress is reported');
  const terminal = updates.at(-1).timeline;
  assert.equal(terminal.status, 'ready');
  assert.equal(terminal.progress, 1);
  assert.ok(terminal.dialogue.length > 0);
  assert.equal(terminal.subtitles.length, terminal.dialogue.length);
  for (const { timeline, snapshot } of updates) {
    assert.deepEqual(timeline, snapshot, 'later events never mutate earlier snapshots');
  }
  const count = updates.length;
  t.mock.timers.tick(20_000);
  assert.equal(updates.length, count, 'a finished story stops emitting');
});

test('a forced failure finishes failed with a human message and no script', (t) => {
  clock(t);
  const engine = createStoryEngine({ seed: 'demo', outcome: 'failure' });
  const updates = [];
  engine.compose({ prompt, lang: 'fr-FR' }, (timeline) => updates.push(timeline));
  t.mock.timers.tick(10_000);
  const terminal = updates.at(-1);
  assert.equal(terminal.status, 'failed');
  assert.equal(typeof terminal.error, 'string');
  assert.ok(terminal.error.trim().length >= 15, 'failure explains itself in human language');
  assert.equal(terminal.dialogue.length, 0);
});

test('timeScale 0 still delivers the skeleton before any asynchronous update', (t) => {
  clock(t);
  const engine = createStoryEngine({ seed: 0, outcome: 'success', timeScale: 0 });
  const updates = [];
  const skeleton = engine.compose({ prompt, lang: 'de-DE' }, (timeline) => updates.push(timeline));
  assert.equal(updates.length, 0);
  assert.equal(skeleton.status, 'queued');
  t.mock.timers.tick(1);
  assert.equal(updates.at(-1).status, 'ready');
});

test('invalid engine options reject instead of silently changing behavior', () => {
  for (const timeScale of [-1, NaN, Infinity, 1_000_000]) {
    assert.throws(() => createStoryEngine({ timeScale }));
  }
  for (const outcome of ['', 'succeed', 'always']) assert.throws(() => createStoryEngine({ outcome }));
});

test('selectVoice prefers a named voice, then the exact language, then the base language', () => {
  const voices = [
    { name: 'Random', lang: 'en-GB' },
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Thomas', lang: 'fr-FR' },
  ];
  assert.equal(selectVoice('en-US', voices).name, 'Samantha');
  assert.equal(selectVoice('fr-FR', voices).name, 'Thomas');
  assert.equal(selectVoice('en-AU', [{ name: 'Only', lang: 'en-IN' }]).name, 'Only');
  assert.equal(selectVoice('ja-JP', voices), null);
  assert.equal(selectVoice('en-US', []), null);
});

test('store composes a story, toggles composing, and charges credits only on success', (t) => {
  clock(t);
  const engine = createStoryEngine({ seed: 'store', outcome: 'success' });
  const store = createStoryStore(engine, { initialCredits: 100 });
  const cost = engine.quote({ prompt, lang: 'en-US', targetMs: THREE_MIN });

  store.getState().composeStory(prompt, 'en-US', THREE_MIN);
  assert.equal(store.getState().composing, true);
  assert.equal(store.getState().timeline.status, 'queued');
  assert.equal(store.getState().credits, 100, 'nothing is charged up front');

  t.mock.timers.tick(10_000);
  assert.equal(store.getState().composing, false);
  assert.equal(store.getState().timeline.status, 'ready');
  assert.ok(store.getState().timeline.dialogue.length > 0);
  assert.equal(store.getState().credits, 100 - cost);
});

test('store rejects empty prompts, unknown languages, and unaffordable stories', (t) => {
  clock(t);
  const failing = createStoryStore(createStoryEngine({ seed: 's' }));
  failing.getState().composeStory('   ', 'en-US');
  assert.equal(failing.getState().lastError?.code, 'invalid-input');
  failing.getState().composeStory(prompt, 'zz-ZZ');
  assert.equal(failing.getState().lastError?.code, 'invalid-input');

  const broke = createStoryStore(createStoryEngine({ seed: 's' }), { initialCredits: 1 });
  broke.getState().composeStory(prompt, 'en-US', THREE_MIN);
  assert.equal(broke.getState().lastError?.code, 'insufficient-credits');
  assert.equal(broke.getState().timeline, null);
});

test('a forced failure in the store surfaces an error and never charges credits', (t) => {
  clock(t);
  const engine = createStoryEngine({ seed: 'store', outcome: 'failure' });
  const store = createStoryStore(engine, { initialCredits: 100 });
  store.getState().composeStory(prompt, 'en-US', THREE_MIN);
  t.mock.timers.tick(10_000);
  assert.equal(store.getState().composing, false);
  assert.equal(store.getState().timeline.status, 'failed');
  assert.equal(store.getState().credits, 100, 'a failed story is free');
  assert.equal(store.getState().lastError?.code, 'engine-error');
});

test('extractSubject finds the hero noun phrase, so titles and narration read as whole phrases', () => {
  assert.equal(extractSubject('A young lighthouse keeper follows a wandering star and finds her way home.'), 'the young lighthouse keeper');
  assert.equal(extractSubject('In a small village by the sea, an old fisherman discovers a message'), 'the old fisherman');
  assert.equal(extractSubject('Mira, a lighthouse keeper, climbs the tower'), 'Mira');
  assert.equal(extractSubject('Two brothers build a raft to cross the river'), 'two brothers');
  assert.equal(extractSubject('robot learns to paint'), 'the robot');
  assert.equal(extractSubject('a lonely lighthouse keeper'), 'the lonely lighthouse keeper');
  assert.equal(extractSubject('   '), 'the hero');
  // Other languages get the bare phrase; their templates supply the grammar.
  assert.equal(extractSubject('A young lighthouse keeper follows a star', 'es-ES'), 'young lighthouse keeper');
  const title = buildTimeline({ prompt: 'A young lighthouse keeper follows a wandering star and finds her way home.', lang: 'en-US' }, { idPrefix: 't' }).title;
  assert.equal(title, 'The Story of the young lighthouse keeper');
});
