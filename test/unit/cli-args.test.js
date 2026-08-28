import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMonitorArgs,
  parseManagerArgs,
  parseConfigArgs,
  parseControlArgs
} from '../../src/cli/args.js';

function base(codexArgs = []) {
  return {
    action: 'run',
    auth: 'auto',
    codexArgs,
    overrides: { preset: null, theme: null, background: null, language: null, managerView: null },
    demo: { state: 'idle' }
  };
}

test('codexm forwards every short and long flag unchanged to official Codex', () => {
  const argv = ['-h', '-v', '-m', 'gpt-5', '-c', 'model_reasoning_effort=high', '--help', '--version', '--manager', '--repair'];
  assert.deepEqual(parseMonitorArgs(argv), base(argv));
});

test('codexm preserves exact argument order including explicit -- boundary', () => {
  const argv = ['resume', '--', '-m', 'gpt-5', '--some-future-flag'];
  assert.deepEqual(parseMonitorArgs(argv), base(argv));
});

test('codexmm owns only Manager-specific options', () => {
  assert.deepEqual(parseManagerArgs([]), { help: false, view: null });
  assert.deepEqual(parseManagerArgs(['-h']), { help: true, view: null });
  assert.deepEqual(parseManagerArgs(['--view', 'charts']), { help: false, view: 'charts' });
  assert.deepEqual(parseManagerArgs(['--view=auto']), { help: false, view: 'auto' });
  assert.throws(() => parseManagerArgs(['-m']), /Unknown codexmm option/);
});

test('codexmc owns Config help and reset only', () => {
  assert.deepEqual(parseConfigArgs([]), { help: false, reset: false });
  assert.deepEqual(parseConfigArgs(['--help']), { help: true, reset: false });
  assert.deepEqual(parseConfigArgs(['--reset']), { help: false, reset: true });
  assert.throws(() => parseConfigArgs(['--manager']), /Unknown codexmc option/);
});

test('codexmctl routes maintenance commands without occupying codexm flags', () => {
  assert.deepEqual(parseControlArgs([]), { command: 'help', demoState: 'idle' });
  assert.deepEqual(parseControlArgs(['diagnostics']), { command: 'doctor', demoState: 'idle' });
  assert.deepEqual(parseControlArgs(['repair']), { command: 'repair', demoState: 'idle' });
  assert.deepEqual(parseControlArgs(['demo', 'approval']), { command: 'demo', demoState: 'approval' });
  assert.throws(() => parseControlArgs(['unknown']), /Unknown codexmctl command/);
});
