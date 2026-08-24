import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentRunState, resetCurrentRunState } from '../../src/core/state.js';

test('old Login telemetry cannot contaminate a new API run', () => {
  const login = createCurrentRunState({ authMode: 'login', runId: 'login-old', startedAtMs: 1 });
  login.quota.fiveHour = { remainingPercent: 31 };
  login.quota.weekly = { remainingPercent: 60 };
  login.context.usedTokens = 82000;
  login.session.turnCount = 20;

  const api = resetCurrentRunState(login, { authMode: 'api', runId: 'api-new', startedAtMs: 2 });
  assert.equal(api.run.authMode, 'api');
  assert.equal(api.quota.fiveHour, null);
  assert.equal(api.quota.weekly, null);
  assert.equal(api.context.usedTokens, null);
  assert.equal(api.session.turnCount, null);
});

test('old API telemetry cannot contaminate a new Login run', () => {
  const api = createCurrentRunState({ authMode: 'api', runId: 'api-old', startedAtMs: 1 });
  api.usage.inputTokens = 1000;
  api.model.actual = 'server-model';

  const login = resetCurrentRunState(api, { authMode: 'login', runId: 'login-new', startedAtMs: 2 });
  assert.equal(login.usage.inputTokens, null);
  assert.equal(login.model.actual, null);
  assert.equal(login.quota.fiveHour, null);
  assert.equal(login.quota.weekly, null);
});
