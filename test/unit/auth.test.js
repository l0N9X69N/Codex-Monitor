import test from 'node:test';
import assert from 'node:assert/strict';
import {
  childEnvironmentForAuth,
  codexArgsForAuth,
  codexStatusSpawnPlan,
  detectAuth,
  parseCodexLoginStatus
} from '../../src/core/auth.js';

test('parse Codex login status modes', () => {
  assert.equal(parseCodexLoginStatus('Logged in using ChatGPT').mode, 'login');
  assert.equal(parseCodexLoginStatus('Logged in using an API key - sk-...').mode, 'api');
  assert.equal(parseCodexLoginStatus('Logged in using an access token').mode, 'other');
  assert.equal(parseCodexLoginStatus('Not logged in').mode, 'unknown');
});

test('explicit auth override wins over environment and status', () => {
  const auth = detectAuth({
    override: 'login',
    env: { CODEX_API_KEY: 'secret' },
    statusRunner: () => ({ ok: true, stdout: 'Logged in using an API key', stderr: '' })
  });
  assert.deepEqual(auth, { mode: 'login', source: 'override', forced: true });
});

test('CODEX_API_KEY is an API signal without exposing key content', () => {
  const auth = detectAuth({ env: { CODEX_API_KEY: 'top-secret' }, statusRunner: () => { throw new Error('should not run'); } });
  assert.deepEqual(auth, { mode: 'api', source: 'env:CODEX_API_KEY', forced: false });
  assert.equal(JSON.stringify(auth).includes('top-secret'), false);
});

test('forced login removes CODEX_API_KEY only in the child environment', () => {
  const parent = { CODEX_API_KEY: 'secret', KEEP: 'yes' };
  const child = childEnvironmentForAuth({ mode: 'login', forced: true }, parent);
  assert.equal(parent.CODEX_API_KEY, 'secret');
  assert.equal(child.CODEX_API_KEY, undefined);
  assert.equal(child.KEEP, 'yes');
});

test('forced auth is applied through child-only Codex config args', () => {
  assert.deepEqual(codexArgsForAuth({ mode: 'api', forced: true }, ['resume']), ['-c', "forced_login_method='api'", 'resume']);
  assert.deepEqual(codexArgsForAuth({ mode: 'login', forced: true }, ['resume']), ['-c', "forced_login_method='chatgpt'", 'resume']);
  assert.deepEqual(codexArgsForAuth({ mode: 'login', forced: false }, ['resume']), ['resume']);
});

test('Windows Codex .cmd status uses ComSpec instead of direct CreateProcess', () => {
  const plan = codexStatusSpawnPlan({
    codexPath: 'C:/Users/me/AppData/Roaming/npm/codex.cmd',
    platform: 'win32',
    env: { ComSpec: 'C:/Windows/System32/cmd.exe' }
  });
  assert.equal(plan.command, 'C:/Windows/System32/cmd.exe');
  assert.deepEqual(plan.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(plan.args[3], /codex\.cmd.*login status/i);
});
