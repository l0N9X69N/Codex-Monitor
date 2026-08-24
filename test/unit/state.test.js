import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentRunState, resetCurrentRunState } from '../../src/core/state.js';

test('new run starts with current telemetry unknown', () => {
  const state = createCurrentRunState({ startedAtMs: 1, authMode: 'login', runId: 'run-a' });
  assert.equal(state.context.usedTokens.value, null);
  assert.equal(state.usage.inputTokens.value, null);
  assert.equal(state.quota.fiveHour.value, null);
  assert.equal(state.quota.weekly.value, null);
  assert.equal(state.session.turnCount.value, null);
  assert.equal(state.session.threadId.value, null);
  assert.equal(state.compaction.count.value, null);
  assert.equal(state.model.actual.value, null);
  assert.equal(state.activity.retryCount.value, null);
  assert.equal(state.activity.errorCount.value, null);
});

test('reset never carries previous telemetry into the next run', () => {
  const old = createCurrentRunState({ startedAtMs: 1, authMode: 'login', runId: 'old' });
  old.context.usedTokens.value = 123;
  old.usage.inputTokens.value = 456;
  old.quota.fiveHour.value = { remainingPercent: 50 };
  old.session.turnCount.value = 9;
  old.model.actual.value = 'old-model';

  const next = resetCurrentRunState(old, { startedAtMs: 2, runId: 'new', authMode: 'api' });
  assert.equal(next.run.id, 'new');
  assert.equal(next.auth.mode.value, 'api');
  assert.equal(next.context.usedTokens.value, null);
  assert.equal(next.usage.inputTokens.value, null);
  assert.equal(next.quota.fiveHour.value, null);
  assert.equal(next.session.turnCount.value, null);
  assert.equal(next.model.actual.value, null);
});
