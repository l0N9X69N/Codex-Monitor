import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentRunState, resetCurrentRunState } from '../../src/core/state.js';

test('new run starts with current telemetry unknown', () => {
  const state = createCurrentRunState({ startedAtMs: 1, authMode: 'login', runId: 'run-a' });
  assert.equal(state.context.usedTokens, null);
  assert.equal(state.usage.inputTokens, null);
  assert.equal(state.quota.fiveHour, null);
  assert.equal(state.quota.weekly, null);
  assert.equal(state.session.turnCount, null);
  assert.equal(state.session.threadId, null);
  assert.equal(state.session.compactCount, null);
  assert.equal(state.model.actual, null);
  assert.equal(state.activity.retryCount, null);
  assert.equal(state.activity.errorCount, null);
});

test('reset never carries previous telemetry into the next run', () => {
  const old = createCurrentRunState({ startedAtMs: 1, authMode: 'login', runId: 'old' });
  old.context.usedTokens = 123;
  old.usage.inputTokens = 456;
  old.quota.fiveHour = { remainingPercent: 50 };
  old.session.turnCount = 9;
  old.model.actual = 'old-model';

  const next = resetCurrentRunState(old, { startedAtMs: 2, runId: 'new', authMode: 'api' });
  assert.equal(next.run.id, 'new');
  assert.equal(next.run.authMode, 'api');
  assert.equal(next.context.usedTokens, null);
  assert.equal(next.usage.inputTokens, null);
  assert.equal(next.quota.fiveHour, null);
  assert.equal(next.session.turnCount, null);
  assert.equal(next.model.actual, null);
});
