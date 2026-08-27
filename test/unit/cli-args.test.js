import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMonitorArgs } from '../../src/cli/args.js';

function overrides(expected = {}) {
  return { preset: null, theme: null, background: null, language: null, managerView: null, ...expected };
}

function base(expected = {}) {
  return {
    action: 'run',
    auth: 'auto',
    codexArgs: [],
    overrides: overrides(),
    demo: { state: 'idle' },
    ...expected
  };
}

test('monitor auth option is consumed while Codex args remain intact', () => {
  assert.deepEqual(parseMonitorArgs(['--auth', 'api', 'resume', '-m', 'x']), base({ auth: 'api', codexArgs: ['resume', '-m', 'x'] }));
});

test('-- escape hatch passes monitor-looking flags to Codex', () => {
  assert.deepEqual(parseMonitorArgs(['--', '--help']), base({ codexArgs: ['--help'] }));
  assert.deepEqual(parseMonitorArgs(['--', '--background', 'dark']), base({ codexArgs: ['--background', 'dark'] }));
});

test('--version remains a Codex argument', () => {
  assert.deepEqual(parseMonitorArgs(['--version']), base({ codexArgs: ['--version'] }));
});

test('runtime overrides are consumed by Monitor', () => {
  assert.deepEqual(parseMonitorArgs(['--preset', 'compact', '--theme=matrix', '--background', 'black', '--lang', 'en', 'resume']), base({
    codexArgs: ['resume'], overrides: overrides({ preset: 'compact', theme: 'matrix', background: 'black', language: 'en' })
  }));
});

test('background override accepts both separated and equals syntax', () => {
  assert.deepEqual(parseMonitorArgs(['--background', 'dark']), base({ overrides: overrides({ background: 'dark' }) }));
  assert.deepEqual(parseMonitorArgs(['--background=terminal']), base({ overrides: overrides({ background: 'terminal' }) }));
});

test('demo state implies demo action', () => {
  assert.deepEqual(parseMonitorArgs(['--demo-state', 'approval']), base({ action: 'demo', demo: { state: 'approval' } }));
});

test('--manager is Monitor-owned', () => {
  assert.deepEqual(parseMonitorArgs(['--manager']), base({ action: 'manager' }));
});

test('--manager-view is Monitor-owned only with Manager action', () => {
  assert.deepEqual(parseMonitorArgs(['--manager-view', 'charts', '--manager']), base({
    action: 'manager', overrides: overrides({ managerView: 'charts' })
  }));
  assert.throws(() => parseMonitorArgs(['--manager-view', 'charts']), /requires --manager/);
});

test('conflicting Monitor actions fail instead of last-action-wins routing', () => {
  assert.throws(() => parseMonitorArgs(['--manager', '--doctor']), /Conflicting Monitor actions/);
  assert.throws(() => parseMonitorArgs(['--config', '--reset']), /Conflicting Monitor actions/);
});

test('--history is no longer Monitor-owned and is forwarded to official Codex', () => {
  assert.deepEqual(parseMonitorArgs(['--history']), base({ codexArgs: ['--history'] }));
});
