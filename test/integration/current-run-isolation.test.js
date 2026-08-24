import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentRunState, resetCurrentRunState } from '../../src/core/state.js';

test('old Login telemetry cannot contaminate a new API run', () => {
  const login = createCurrentRunState({ authMode: 'login', runId: 'login-old', startedAtMs: 1 });
  login.quota.fiveHour.value = { remainingPercent: 31 };
  login.quota.weekly.value = { remainingPercent: 60 };
  login.context.usedTokens.value = 82000;
  login.session.turnCount.value = 20;

  const api = resetCurrentRunState(login, { authMode: 'api', runId: 'api-new', startedAtMs: 2 });
  assert.equal(api.auth.mode.value, 'api');
  assert.equal(api.quota.fiveHour.value, null);
  assert.equal(api.quota.weekly.value, null);
  assert.equal(api.context.usedTokens.value, null);
  assert.equal(api.session.turnCount.value, null);
});

test('old API telemetry cannot contaminate a new Login run', () => {
  const api = createCurrentRunState({ authMode: 'api', runId: 'api-old', startedAtMs: 1 });
  api.usage.inputTokens.value = 1000;
  api.model.actual.value = 'server-model';

  const login = resetCurrentRunState(api, { authMode: 'login', runId: 'login-new', startedAtMs: 2 });
  assert.equal(login.usage.inputTokens.value, null);
  assert.equal(login.model.actual.value, null);
  assert.equal(login.quota.fiveHour.value, null);
  assert.equal(login.quota.weekly.value, null);
});
