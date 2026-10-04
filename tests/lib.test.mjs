import test from 'node:test';
import assert from 'node:assert/strict';
import { quote, costLabel } from '../src/lib/cost.ts';
import { cn } from '../src/lib/cn.ts';
import { hashId, posterColors, posterStyle, aspectFor, ratioLabel, sceneLayout, mixHex } from '../src/lib/media.ts';
import { hotkeyName, resolveHotkey } from '../src/lib/hotkeys.ts';

// Part C — UI. The src/lib helpers are pure and were untested. They back the
// cost chips, poster placeholders, and layout, so pinning them guards the
// visible surface without needing a DOM.

test('cost.quote mirrors the engine price list', () => {
  assert.equal(quote('draft', 'social'), 0);
  assert.equal(quote('draft', 'cinematic'), 0);
  assert.equal(quote('render', 'social'), 4);
  assert.equal(quote('render', 'ad'), 6);
  assert.equal(quote('render', 'cinematic'), 8);
});

test('cost.costLabel reads "Free" at zero and spells out credits otherwise', () => {
  assert.equal(costLabel(0), 'Free');
  assert.equal(costLabel(1), '1 credit');
  assert.equal(costLabel(4), '4 credits');
  assert.equal(costLabel(8), '8 credits');
});

test('cn joins truthy class names and drops falsy ones', () => {
  assert.equal(cn('a', 'b', 'c'), 'a b c');
  assert.equal(cn('a', false, null, undefined, '', 'b'), 'a b');
  assert.equal(cn(), '');
  assert.equal(cn(false && 'x', 'only'), 'only');
});

test('hashId is deterministic, non-negative, and varies by input', () => {
  assert.equal(hashId('take-1'), hashId('take-1'));
  assert.ok(hashId('take-1') >= 0);
  assert.notEqual(hashId('take-1'), hashId('take-2'));
  assert.equal(typeof hashId(''), 'number');
});

test('posterColors returns a stable hex pair from the palette', () => {
  const pair = posterColors('take-1');
  assert.equal(pair.length, 2);
  for (const c of pair) assert.match(c, /^#[0-9A-Fa-f]{6}$/);
  assert.deepEqual(posterColors('take-1'), pair, 'stable for the same id');
});

test('posterStyle is deterministic and layers sky and light over the land color', () => {
  const style = posterStyle('take-1');
  const [sky, land] = posterColors('take-1');
  assert.equal(style.backgroundColor, land);
  assert.match(style.backgroundImage, /radial-gradient/);
  assert.match(style.backgroundImage, /linear-gradient/);
  assert.ok(style.backgroundImage.includes(sky), 'sky band uses the pair');
  assert.deepEqual(posterStyle('take-1'), style);
});

test('sceneLayout keeps the light above the ridge and the ridge above the horizon', () => {
  for (const id of ['take-1', 'scene-a', 'x', '']) {
    const { horizon, ridge, lightY } = sceneLayout(id);
    assert.ok(lightY < ridge && ridge < horizon && horizon < 100, id);
  }
});

test('mixHex blends channel-wise and clamps to the endpoints', () => {
  assert.equal(mixHex('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(mixHex('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(mixHex('#000000', '#FF8800', 0.5), '#804400');
});

test('aspectFor maps each intent to its aspect ratio', () => {
  assert.equal(aspectFor('social'), '9 / 16');
  assert.equal(aspectFor('ad'), '4 / 5');
  assert.equal(aspectFor('cinematic'), '16 / 9');
});

test('ratioLabel prints the conventional ratio notation', () => {
  assert.equal(ratioLabel('social'), '9:16');
  assert.equal(ratioLabel('ad'), '4:5');
  assert.equal(ratioLabel('cinematic'), '16:9');
});

// Shortcuts. A bare 'r' renders (and spends credits), so a modified press like
// Ctrl/Cmd+R (refresh) must never fall back to it.
const press = (key, mods = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
const takeKeys = { r: 'render', m: 'remix', n: 'new prompt', escape: 'back', arrowleft: 'prev' };

test('hotkeyName orders modifiers and folds Ctrl and Cmd into mod', () => {
  assert.equal(hotkeyName(press('r')), 'r');
  assert.equal(hotkeyName(press('R', { ctrlKey: true, shiftKey: true })), 'mod+shift+r');
  assert.equal(hotkeyName(press('r', { metaKey: true })), 'mod+r');
  assert.equal(hotkeyName(press('r', { altKey: true })), 'alt+r');
  assert.equal(hotkeyName(press('ArrowLeft')), 'arrowleft');
});

test('browser shortcuts never trigger bare-key actions (Ctrl/Cmd+R refreshes, not renders)', () => {
  assert.equal(resolveHotkey(press('r', { ctrlKey: true }), takeKeys), undefined);
  assert.equal(resolveHotkey(press('r', { metaKey: true }), takeKeys), undefined);
  assert.equal(resolveHotkey(press('R', { ctrlKey: true, shiftKey: true }), takeKeys), undefined);
  assert.equal(resolveHotkey(press('R', { shiftKey: true }), takeKeys), undefined);
  assert.equal(resolveHotkey(press('r', { altKey: true }), takeKeys), undefined);
  assert.equal(resolveHotkey(press('n', { ctrlKey: true }), takeKeys), undefined);
  assert.equal(resolveHotkey(press('m', { metaKey: true }), takeKeys), undefined);
});

test('ordinary R, M, N, arrow, and Escape shortcuts still fire', () => {
  assert.equal(resolveHotkey(press('r'), takeKeys), 'render');
  assert.equal(resolveHotkey(press('m'), takeKeys), 'remix');
  assert.equal(resolveHotkey(press('n'), takeKeys), 'new prompt');
  assert.equal(resolveHotkey(press('ArrowLeft'), takeKeys), 'prev');
  assert.equal(resolveHotkey(press('Escape'), takeKeys), 'back');
});

test('while typing, bare keys go to the field; Escape and modifier combos still fire', () => {
  const keys = { ...takeKeys, 'mod+enter': 'submit' };
  assert.equal(resolveHotkey(press('r'), keys, true), undefined);
  assert.equal(resolveHotkey(press('ArrowLeft'), keys, true), undefined);
  assert.equal(resolveHotkey(press('Escape'), keys, true), 'back');
  assert.equal(resolveHotkey(press('Enter', { ctrlKey: true }), keys, true), 'submit');
  assert.equal(resolveHotkey(press('Enter', { metaKey: true }), keys, true), 'submit');
  assert.equal(resolveHotkey(press('Enter', { ctrlKey: true, altKey: true }), keys, true), undefined);
  assert.equal(resolveHotkey(press('Enter'), keys, true), undefined);
});

