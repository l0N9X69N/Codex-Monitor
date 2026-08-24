import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveActivityState } from '../../src/core/activity.js';

test('activity priority is ERROR > APPROVAL > TOOL > THINKING > IDLE', () => {
  assert.equal(resolveActivityState({ error: true, approval: true, tool: true, thinking: true }), 'ERROR');
  assert.equal(resolveActivityState({ approval: true, tool: true, thinking: true }), 'APPROVAL');
  assert.equal(resolveActivityState({ tool: true, thinking: true }), 'TOOL');
  assert.equal(resolveActivityState({ thinking: true }), 'THINKING');
  assert.equal(resolveActivityState({}), 'IDLE');
});
