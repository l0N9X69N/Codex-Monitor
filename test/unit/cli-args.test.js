import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMonitorArgs } from '../../src/cli/args.js';

function base(expected = {}) {
  return {
    action: 'run',
    auth: 'auto',
    codexArgs: [],
    overrides: { preset: null, theme: null, language: null },
    demo: { state: 'idle' },
    ...expected
  };
}

test('monitor auth option is consumed while Codex args remain intact', () => {
  assert.deepEqual(parseMonitorArgs(['--auth', 'api', 'resume', '-m', 'x']), base({ auth: 'api', codexArgs: ['resume', '-m', 'x'] }));
});

test('-- escape hatch passes monitor-looking flags to Codex', () => {
  assert.deepEqual(parseMonitorArgs(['--', '--help']), base({ codexArgs: ['--help'] }));
});

test('--version remains a Codex argument', () => {
  assert.deepEqual(parseMonitorArgs(['--version']), base({ codexArgs: ['--version'] }));
});

test('runtime overrides are consumed by Monitor', () => {
  assert.deepEqual(parseMonitorArgs(['--preset', 'compact', '--theme=matrix', '--lang', 'en', 'resume']), base({
    codexArgs: ['resume'], overrides: { preset: 'compact', theme: 'matrix', language: 'en' }
  }));
});

test('demo state implies demo action', () => {
  assert.deepEqual(parseMonitorArgs(['--demo-state', 'approval']), base({ action: 'demo', demo: { state: 'approval' } }));
});

test('--manager is Monitor-owned', () => {
  assert.deepEqual(parseMonitorArgs(['--manager']), base({ action: 'manager' }));
});

test('--history is no longer Monitor-owned and is forwarded to official Codex', () => {
  assert.deepEqual(parseMonitorArgs(['--history']), base({ codexArgs: ['--history'] }));
});
