import test from 'node:test';
import assert from 'node:assert/strict';
import { quote, costLabel } from '../src/lib/cost.ts';
import { cn } from '../src/lib/cn.ts';
import { hashId, posterColors, posterStyle, aspectFor } from '../src/lib/media.ts';

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

test('cost.costLabel reads "Free" at zero and "N cr" otherwise', () => {
  assert.equal(costLabel(0), 'Free');
  assert.equal(costLabel(4), '4 cr');
  assert.equal(costLabel(8), '8 cr');
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

test('posterStyle is deterministic and includes gradient layers', () => {
  const style = posterStyle('take-1');
  assert.equal(style.backgroundColor, '#0A0E1C');
  assert.match(style.backgroundImage, /radial-gradient/);
  assert.match(style.backgroundImage, /linear-gradient/);
  assert.deepEqual(posterStyle('take-1'), style);
});

test('aspectFor maps each intent to its aspect ratio', () => {
  assert.equal(aspectFor('social'), '9 / 16');
  assert.equal(aspectFor('ad'), '4 / 5');
  assert.equal(aspectFor('cinematic'), '16 / 9');
});
