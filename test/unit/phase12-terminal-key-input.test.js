import { PassThrough } from 'node:stream';
import test from 'node:test';
import assert from 'node:assert/strict';
import { attachTerminalKeyInput } from '../../src/terminal/key-input.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('terminal input delivers standalone Escape exactly once despite delayed readline decoding', async () => {
  const stream = new PassThrough();
  const seen = [];
  const detach = attachTerminalKeyInput(stream, (raw) => seen.push(raw));
  try {
    stream.write('\x1b');
    await delay(700);
    assert.deepEqual(seen, ['\x1b']);
  } finally {
    detach();
    stream.destroy();
  }
});

test('terminal input preserves repeated Escape presses one-for-one', async () => {
  const stream = new PassThrough();
  const seen = [];
  const detach = attachTerminalKeyInput(stream, (raw) => seen.push(raw));
  try {
    stream.write('\x1b');
    await delay(100);
    stream.write('\x1b');
    await delay(700);
    assert.deepEqual(seen, ['\x1b', '\x1b']);
  } finally {
    detach();
    stream.destroy();
  }
});

test('terminal input does not mistake arrow escape sequences for standalone Escape', async () => {
  const stream = new PassThrough();
  const seen = [];
  const detach = attachTerminalKeyInput(stream, (raw) => seen.push(raw));
  try {
    stream.write('\x1b[A');
    await delay(80);
    assert.deepEqual(seen, ['\x1b[A']);
  } finally {
    detach();
    stream.destroy();
  }
});
