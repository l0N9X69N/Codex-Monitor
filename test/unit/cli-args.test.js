import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMonitorArgs } from '../../src/cli/args.js';

test('monitor auth option is consumed while Codex args remain intact', () => {
  assert.deepEqual(parseMonitorArgs(['--auth', 'api', 'resume', '-m', 'x']), {
    action: 'run', auth: 'api', codexArgs: ['resume', '-m', 'x']
  });
});

test('-- escape hatch passes monitor-looking flags to Codex', () => {
  assert.deepEqual(parseMonitorArgs(['--', '--help']), {
    action: 'run', auth: 'auto', codexArgs: ['--help']
  });
});

test('--version remains a Codex argument', () => {
  assert.deepEqual(parseMonitorArgs(['--version']), {
    action: 'run', auth: 'auto', codexArgs: ['--version']
  });
});
