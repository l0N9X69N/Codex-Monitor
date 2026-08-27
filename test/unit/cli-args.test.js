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
  assert.deepEqual(parseMonitorArgs(['--', '--version']), base({ codexArgs: ['--version'] }));
  assert.deepEqual(parseMonitorArgs(['--', '-m', 'gpt-5']), base({ codexArgs: ['-m', 'gpt-5'] }));
});

test('Phase 13 product control actions are Monitor-owned', () => {
  assert.deepEqual(parseMonitorArgs(['--version']), base({ action: 'monitor-version' }));
  assert.deepEqual(parseMonitorArgs(['--monitor-version']), base({ action: 'monitor-version' }));
  assert.deepEqual(parseMonitorArgs(['--diagnostics']), base({ action: 'doctor' }));
  assert.deepEqual(parseMonitorArgs(['--update']), base({ action: 'update' }));
  assert.deepEqual(parseMonitorArgs(['--uninstall']), base({ action: 'uninstall' }));
});

test('short Monitor action aliases work only before Codex arguments begin', () => {
  assert.deepEqual(parseMonitorArgs(['-h']), base({ action: 'help' }));
  assert.deepEqual(parseMonitorArgs(['-m']), base({ action: 'manager' }));
  assert.deepEqual(parseMonitorArgs(['-c']), base({ action: 'configure' }));
  assert.deepEqual(parseMonitorArgs(['-v']), base({ action: 'monitor-version' }));

  assert.deepEqual(parseMonitorArgs(['resume', '-m', 'gpt-5']), base({ codexArgs: ['resume', '-m', 'gpt-5'] }));
  assert.deepEqual(parseMonitorArgs(['exec', '-c', 'model_reasoning_effort=high']), base({ codexArgs: ['exec', '-c', 'model_reasoning_effort=high'] }));
  assert.deepEqual(parseMonitorArgs(['resume', '-h']), base({ codexArgs: ['resume', '-h'] }));
  assert.deepEqual(parseMonitorArgs(['resume', '-v']), base({ codexArgs: ['resume', '-v'] }));
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
  assert.throws(() => parseMonitorArgs(['--update', '--uninstall']), /Conflicting Monitor actions/);
  assert.throws(() => parseMonitorArgs(['-m', '-c']), /Conflicting Monitor actions/);
});

test('--history is no longer Monitor-owned and is forwarded to official Codex', () => {
  assert.deepEqual(parseMonitorArgs(['--history']), base({ codexArgs: ['--history'] }));
});
