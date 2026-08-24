import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installProcessSafety } from '../../src/terminal/process-safety.js';

class FakeProcess extends EventEmitter {}

test('signal and fatal paths restore terminal before callbacks', () => {
  const processRef = new FakeProcess();
  const events = [];
  const guard = { restore() { events.push('restore'); } };
  const dispose = installProcessSafety({
    guard,
    processRef,
    onSignal(signal) { events.push(`signal:${signal}`); },
    onFatal(error, kind) { events.push(`fatal:${kind}:${error.message}`); }
  });

  processRef.emit('SIGTERM');
  assert.deepEqual(events.slice(0, 2), ['restore', 'signal:SIGTERM']);

  processRef.emit('uncaughtException', new Error('boom'));
  assert.deepEqual(events.slice(2, 4), ['restore', 'fatal:uncaughtException:boom']);

  dispose();
  assert.equal(processRef.listenerCount('SIGTERM'), 0);
  assert.equal(processRef.listenerCount('uncaughtException'), 0);
});
