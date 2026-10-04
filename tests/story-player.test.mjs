import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_FIXTURES } from '../src/ui/story/fixtures.ts';
import { PlaybackClock, frameAt, estimatedViseme, speechOffset } from '../src/ui/story/playback.ts';
import { Narrator } from '../src/ui/story/Narrator.ts';
import { chooseVoice, matchingVoices } from '../src/ui/story/voices.ts';
import { subtitlesToVtt } from '../src/ui/story/export/subtitles.ts';
import { recordCanvas } from '../src/ui/story/export/recorder.ts';

const english = { name: 'English', voiceURI: 'english', lang: 'en-US', localService: true, default: true };
const spanish = { ...english, name: 'Spanish', voiceURI: 'spanish', lang: 'es-ES', default: false };

function speechHarness(voices = [english, spanish]) {
  const spoken = [];
  let cancels = 0;
  const errors = [];
  const port = {
    getVoices: () => voices,
    speak: (utterance) => { spoken.push(utterance); utterance.onstart?.(); },
    cancel: () => { cancels++; }, resume() {},
  };
  const narrator = new Narrator(port, (text) => ({ text }), (error) => errors.push(error));
  return { narrator, spoken, errors, cancels: () => cancels };
}

test('clock preserves elapsed time across pause, seek, resume, and replay', () => {
  const clock = new PlaybackClock(180_000);
  clock.play(1000);
  assert.equal(clock.time(2500), 1500);
  clock.play(2500); // repeated play must not reset its anchor
  clock.pause(3000);
  assert.equal(clock.time(80_000), 2000);
  clock.seek(45_000, 80_000);
  clock.play(90_000);
  assert.equal(clock.time(91_000), 46_000);
  clock.seek(179_000, 92_000);
  assert.equal(clock.time(99_000), 180_000);
  clock.pause(99_000);
  clock.play(100_000);
  assert.equal(clock.time(101_000), 1000);
  clock.seek(-100, 101_000);
  assert.equal(clock.time(101_000), 0);
});

test('the same play head selects scenes, dialogue and subtitles without mutating input', () => {
  const timeline = structuredClone(STORY_FIXTURES['en-US']);
  const freeze = (value) => { Object.values(value).forEach((v) => { if (v && typeof v === 'object') freeze(v); }); Object.freeze(value); };
  freeze(timeline);
  assert.equal(frameAt(timeline, 44_999).scene.index, 0);
  assert.equal(frameAt(timeline, 45_000).scene.index, 1);
  const cue = timeline.dialogue[2];
  const frame = frameAt(timeline, cue.startMs);
  assert.equal(frame.dialogue.id, cue.id);
  assert.equal(frame.subtitle.text, cue.text);
  assert.equal(frameAt(timeline, cue.startMs + cue.durationMs).dialogue, undefined);
  assert.equal(frameAt(timeline, 180_000).scene.index, 3);
  assert.equal(frameAt(timeline, 180_000).subtitle, undefined);
});

test('voice matching prefers locale, supports regional fallbacks and never crosses languages', () => {
  const british = { ...english, voiceURI: 'british', lang: 'en-GB' };
  const remote = { ...english, voiceURI: 'remote', localService: false };
  assert.deepEqual(matchingVoices([british, remote, spanish, english], 'en-US'), [english, remote, british]);
  assert.equal(chooseVoice([english, spanish], 'es-MX'), spanish);
  assert.equal(chooseVoice([british, english], 'en-US', 'british'), british);
  assert.equal(chooseVoice([english], 'ur-PK'), undefined);
});

test('narrator starts each cue once, follows live boundaries, and rests when speech ends', () => {
  const { narrator, spoken } = speechHarness();
  const cue = { ...STORY_FIXTURES['en-US'].dialogue[0], text: 'a bee moves', startMs: 0, durationMs: 10_000 };
  narrator.sync(cue, 0, true);
  for (let ms = 10; ms < 100; ms += 10) narrator.sync(cue, ms, true);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].lang, 'en-US');
  spoken[0].onboundary({ charIndex: 2 });
  assert.equal(narrator.sync(cue, 90, true), 'mbp');
  spoken[0].onend();
  assert.equal(narrator.sync(cue, 1000, true), 'rest');
  assert.equal(spoken.length, 1);
});

test('seeking cancels speech, resumes near the selected word and ignores stale callbacks', () => {
  const { narrator, spoken, cancels, errors } = speechHarness();
  const cue = { ...STORY_FIXTURES['en-US'].dialogue[0], text: 'one two three four five', startMs: 0, durationMs: 10_000 };
  narrator.sync(cue, 0, true);
  const old = spoken[0];
  narrator.stop();
  narrator.sync(cue, 5000, true);
  assert.equal(cancels(), 1);
  assert.equal(spoken[1].text, cue.text.slice(speechOffset(cue, 5000)));
  assert.notEqual(spoken[1].text, cue.text);
  old.onerror({ error: 'synthesis-failed' }); old.onend(); old.onboundary({ charIndex: 0 });
  assert.deepEqual(errors, []);
  assert.notEqual(narrator.sync(cue, 5000, true), 'rest');
});

test('missing voices, mute, pauses and cue gaps never leave speech or the mouth running', () => {
  const cue = STORY_FIXTURES['es-ES'].dialogue[0];
  const missing = speechHarness([english]);
  assert.equal(missing.narrator.sync(cue, cue.startMs, true), 'rest');
  assert.equal(missing.spoken.length, 0);
  const speech = speechHarness();
  speech.narrator.sync(cue, cue.startMs, true);
  assert.equal(speech.spoken[0].voice, spanish);
  assert.equal(speech.narrator.sync(cue, cue.startMs + 100, false), 'rest');
  assert.equal(speech.cancels(), 1);
  speech.narrator.sync(cue, cue.startMs + 200, true);
  speech.narrator.sync(undefined, cue.startMs + cue.durationMs, true);
  assert.equal(speech.cancels(), 2);
  speech.narrator.stop();
  assert.equal(speech.cancels(), 2);
});

test('speech errors are surfaced once and voice changes cancel the previous utterance', () => {
  const speech = speechHarness();
  const cue = STORY_FIXTURES['en-US'].dialogue[0];
  speech.narrator.sync(cue, cue.startMs, true);
  speech.narrator.setVoice('english');
  assert.equal(speech.cancels(), 1);
  speech.narrator.sync(cue, cue.startMs, true);
  speech.spoken[1].onerror({ error: 'not-allowed' });
  assert.equal(speech.errors.length, 1);
  assert.equal(speech.narrator.sync(cue, cue.startMs + 100, true), 'rest');
  assert.equal(speech.spoken.length, 2);
});

test('precomputed visemes work without boundary events and become idle outside their cue', () => {
  const cue = { ...STORY_FIXTURES['en-US'].dialogue[0], visemes: [{ atMs: 0, viseme: 'oh' }, { atMs: 300, viseme: 'fv' }] };
  assert.equal(estimatedViseme(cue, cue.startMs - 1), 'rest');
  assert.equal(estimatedViseme(cue, cue.startMs + 299), 'oh');
  assert.equal(estimatedViseme(cue, cue.startMs + 300), 'fv');
  assert.equal(estimatedViseme(cue, cue.startMs + cue.durationMs), 'rest');
});

test('VTT downloads preserve localization, exact timestamps and literal caption text', () => {
  const vtt = subtitlesToVtt([{ id: 'unsafe\nidentifier', cueId: 'a', startMs: 3599999, endMs: 3600100, text: 'Hola <Mira> & amigos\n\nمرحبا -->' }]);
  assert.ok(vtt.startsWith('WEBVTT\n\n1\n00:59:59.999 --> 01:00:00.100\n'));
  assert.ok(vtt.includes('Hola &lt;Mira&gt; &amp; amigos\nمرحبا --&gt;'));
  assert.ok(!vtt.includes('unsafe'));
});

test('recording releases tracks on completion, cancel and construction errors', (t) => {
  let recorder;
  let stops = 0;
  let result;
  const stream = { getTracks: () => [{ stop: () => { stops++; } }], getVideoTracks: () => [] };
  class FakeCanvas { captureStream() { return stream; } }
  class FakeRecorder {
    static isTypeSupported(type) { return type === 'video/webm'; }
    state = 'inactive'; mimeType = 'video/webm';
    constructor() { recorder = this; }
    start() { this.state = 'recording'; this.onstart?.(); }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['frame']) }); this.onstop(); }
  }
  const originals = { MediaRecorder: globalThis.MediaRecorder, HTMLCanvasElement: globalThis.HTMLCanvasElement };
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  globalThis.MediaRecorder = FakeRecorder;
  globalThis.HTMLCanvasElement = FakeCanvas;
  const recording = recordCanvas(new FakeCanvas(), (blob) => { result = blob; }, assert.fail);
  recording.pause(); assert.equal(recorder.state, 'paused');
  recording.resume(); assert.equal(recorder.state, 'recording');
  recording.finish(); assert.equal(stops, 1); assert.equal(result.type, 'video/webm');
  result = undefined;
  const cancelled = recordCanvas(new FakeCanvas(), (blob) => { result = blob; }, assert.fail);
  cancelled.cancel(); assert.equal(result, undefined); assert.ok(stops >= 2);
  const previousStops = stops;
  globalThis.MediaRecorder = class extends FakeRecorder { constructor() { super(); throw new Error('Codec unavailable'); } };
  assert.throws(() => recordCanvas(new FakeCanvas(), assert.fail, assert.fail), /Codec unavailable/);
  assert.equal(stops, previousStops + 1);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.MediaRecorder = class extends FakeRecorder { start() { this.state = 'recording'; } };
  let startupError;
  let started = false;
  recordCanvas(new FakeCanvas(), assert.fail, (message) => { startupError = message; }, () => { started = true; });
  t.mock.timers.tick(10_000);
  assert.match(startupError, /could not start/);
  assert.equal(recorder.state, 'inactive');
  recorder.onstart();
  assert.equal(started, false, 'late startup cannot restart a timed-out capture');
});
