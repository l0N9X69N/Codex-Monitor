import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILES,
  DEFAULT_PROFILE_ID,
  childEnvironmentForProfile,
  codexArgsForProfile,
  resolveProfile
} from '../src/profile.js';

test('architecture exposes the four agreed profiles', () => {
  assert.deepEqual(Object.keys(PROFILES).sort(), ['f-a', 'f-l', 'l-a', 'l-l']);
  assert.equal(DEFAULT_PROFILE_ID, 'f-l');
  assert.equal(resolveProfile().id, 'f-l');
});

test('default full login forces ChatGPT login only for the child process', () => {
  const args = codexArgsForProfile(PROFILES['f-l'], ['resume']);
  assert.deepEqual(args.slice(0, 2), ['-c', `forced_login_method='chatgpt'`]);
  assert.equal(args.at(-1), 'resume');

  const env = childEnvironmentForProfile(PROFILES['f-l'], {
    CODEX_API_KEY: 'secret',
    OPENAI_API_KEY: 'other',
    PATH: 'demo'
  });
  assert.equal(env.CODEX_API_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, 'other');
  assert.equal(env.CODEXM_PROFILE, 'f-l');
});

test('API profile mirrors OPENAI_API_KEY to CODEX_API_KEY without mutating input', () => {
  const source = { OPENAI_API_KEY: 'secret', PATH: 'demo' };
  const env = childEnvironmentForProfile(PROFILES['f-a'], source);
  assert.equal(env.CODEX_API_KEY, 'secret');
  assert.equal(source.CODEX_API_KEY, undefined);
  assert.equal(codexArgsForProfile(PROFILES['f-a'], [])[1], `forced_login_method='api'`);
});
