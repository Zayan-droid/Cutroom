import test from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../src/engine/cost.ts';

// Part A — Engine. Direct unit tests for the pure cost quote. The integration
// suite exercises charging through the store; this pins the price list itself
// so an accidental tweak to a credit value fails loudly here.

const intent = (kind) => ({ kind, subject: 'runner', style: 'film', motion: 'tracking', mood: 'calm' });

test('drafts are always free regardless of intent', () => {
  for (const kind of ['social', 'ad', 'cinematic']) {
    assert.equal(quote('draft', intent(kind)), 0);
  }
});

test('renders are priced per intent kind', () => {
  assert.equal(quote('render', intent('social')), 4);
  assert.equal(quote('render', intent('ad')), 6);
  assert.equal(quote('render', intent('cinematic')), 8);
});

test('render price depends only on kind, not other intent fields', () => {
  const a = quote('render', { kind: 'cinematic', subject: 'a', style: 'x', motion: 'y', mood: 'z' });
  const b = quote('render', { kind: 'cinematic', subject: 'b', style: 'q', motion: 'w', mood: 'e' });
  assert.equal(a, b);
  assert.equal(a, 8);
});

test('quote is pure — repeated calls return the same number', () => {
  const i = intent('ad');
  assert.equal(quote('render', i), quote('render', i));
});
