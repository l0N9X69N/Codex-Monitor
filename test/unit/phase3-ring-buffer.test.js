import test from 'node:test';
import assert from 'node:assert/strict';
import { RingBuffer } from '../../src/core/ring-buffer.js';

test('ring buffer is bounded and keeps newest samples', () => {
  const buffer = new RingBuffer(3);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  buffer.push(4);
  buffer.push(5);
  assert.equal(buffer.size, 3);
  assert.deepEqual(buffer.toArray(), [3, 4, 5]);
});

test('ring buffer clear drops all samples without changing capacity', () => {
  const buffer = new RingBuffer(2);
  buffer.push('a');
  buffer.push('b');
  buffer.clear();
  assert.equal(buffer.size, 0);
  assert.equal(buffer.capacity, 2);
  assert.deepEqual(buffer.toArray(), []);
});
