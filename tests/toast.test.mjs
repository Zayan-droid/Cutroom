import test, { beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { useToasts, toast } from '../src/store/toast.ts';

// Part B — Store. The toast store was the one store module without coverage.
// It auto-dismisses after 2600ms, so we drive time with mocked timers rather
// than waiting (and to keep real timers from leaking across tests).

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  useToasts.setState({ toasts: [] });
});

afterEach(() => {
  mock.timers.reset();
});

test('push adds a toast with a generated id and the default tone', () => {
  useToasts.getState().push('Saved');
  const { toasts } = useToasts.getState();
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'Saved');
  assert.equal(toasts[0].tone, 'default');
  assert.equal(typeof toasts[0].id, 'string');
  assert.ok(toasts[0].id.length > 0);
});

test('push records the requested tone', () => {
  useToasts.getState().push('Rendered', 'success');
  useToasts.getState().push('Failed', 'danger');
  assert.deepEqual(
    useToasts.getState().toasts.map((t) => t.tone),
    ['success', 'danger'],
  );
});

test('pushed toasts get distinct ids and keep insertion order', () => {
  useToasts.getState().push('one');
  useToasts.getState().push('two');
  const { toasts } = useToasts.getState();
  assert.deepEqual(toasts.map((t) => t.text), ['one', 'two']);
  assert.notEqual(toasts[0].id, toasts[1].id);
});

test('dismiss removes only the matching toast', () => {
  useToasts.getState().push('keep');
  useToasts.getState().push('drop');
  const dropId = useToasts.getState().toasts[1].id;
  useToasts.getState().dismiss(dropId);
  const { toasts } = useToasts.getState();
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'keep');
});

test('a toast auto-dismisses after 2600ms', () => {
  useToasts.getState().push('temporary');
  assert.equal(useToasts.getState().toasts.length, 1);
  mock.timers.tick(2599);
  assert.equal(useToasts.getState().toasts.length, 1, 'still visible just before the deadline');
  mock.timers.tick(1);
  assert.equal(useToasts.getState().toasts.length, 0, 'gone at the deadline');
});

test('the standalone toast() helper pushes onto the same store', () => {
  toast('from helper', 'success');
  const { toasts } = useToasts.getState();
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'from helper');
  assert.equal(toasts[0].tone, 'success');
});
