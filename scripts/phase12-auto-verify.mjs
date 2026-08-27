import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Phase 12 product-shell foundation', process.execPath, ['--test',
    'test/unit/cli-args.test.js',
    'test/unit/phase12-product-shell-foundation.test.js',
    'test/unit/phase11-1-manager-config.test.js'
  ]],
  ['Phase 11-1 archive/config safety regression', process.execPath, ['--test',
    'test/unit/phase11-1-archive-config-effects.test.js',
    'test/unit/phase11-1-manager-dynamic-archive-config.test.js',
    'test/unit/phase11-1-manager-service-health.test.js'
  ]],
  ['Manager runtime/input regression', process.execPath, ['--test',
    'test/unit/phase9-tui.test.js',
    'test/unit/phase11-input.test.js'
  ]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 12 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 12 product-shell foundation verification: PASS\n');
process.stdout.write('Gate covers deterministic Monitor action routing, exact Codex passthrough, Manager one-shot view overrides, schema migration/setup state, shared Config persistence, reset-style explicit-save safety, non-TTY no-prompt behavior, and Phase 11-1 Archive/Manager regressions.\n');
