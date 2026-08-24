import test from 'node:test';
import assert from 'node:assert/strict';
import { AnsiDiffRenderer, diffFrames } from '../../src/terminal/diff-renderer.js';
import { createTestInstrumentation } from '../../src/core/instrumentation.js';

test('same frame produces zero write', () => {
  const diff = diffFrames(['a', 'b'], ['a', 'b']);
  assert.equal(diff.output, '');
  assert.deepEqual(diff.dirtyRows, []);
});

test('one-row change emits only that row', () => {
  const diff = diffFrames(['a', 'b', 'c'], ['a', 'B', 'c'], { originRow: 5 });
  assert.deepEqual(diff.dirtyRows, [1]);
  assert.match(diff.output, /\x1b\[6;1HB\x1b\[K/);
  assert.equal(diff.output.includes('5;1H'), false);
  assert.equal(diff.output.includes('7;1H'), false);
});

test('renderer batches all dirty rows into one stdout write and instruments repaint', () => {
  const writes = [];
  const instrumentation = createTestInstrumentation();
  const renderer = new AnsiDiffRenderer({
    stdout: { write(value) { writes.push(value); } },
    instrumentation,
    now: () => 10
  });

  const first = renderer.render(['one', 'two']);
  assert.equal(first.written, true);
  assert.equal(writes.length, 1);
  const second = renderer.render(['ONE', 'two', 'three']);
  assert.equal(second.written, true);
  assert.equal(writes.length, 2);
  assert.deepEqual(second.dirtyRows, [0, 2]);
  const third = renderer.render(['ONE', 'two', 'three']);
  assert.equal(third.written, false);
  assert.equal(writes.length, 2);
  assert.equal(instrumentation.snapshot().repaintCount, 2);
});
