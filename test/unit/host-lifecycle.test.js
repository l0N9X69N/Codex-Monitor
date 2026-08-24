import test from 'node:test';
import assert from 'node:assert/strict';
import { completeHostExit } from '../../src/platform/host-lifecycle.js';

test('Windows host exits explicitly after PTY lifecycle completes', () => {
  const calls = [];
  const processRef = {
    exit(code) { calls.push(code); }
  };

  const code = completeHostExit(7, { processRef, platform: 'win32' });
  assert.equal(code, 7);
  assert.deepEqual(calls, [7]);
});

test('non-Windows host only sets exitCode', () => {
  const processRef = { exitCode: null };
  const code = completeHostExit(3, { processRef, platform: 'linux' });
  assert.equal(code, 3);
  assert.equal(processRef.exitCode, 3);
});
