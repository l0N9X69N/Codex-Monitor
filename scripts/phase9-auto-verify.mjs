import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Phase 08 manager core regression', process.execPath, ['./scripts/phase8-auto-verify.mjs']],
  ['Phase 09 dashboard model/render', process.execPath, ['--test',
    'test/unit/phase9-dashboard.test.js',
    'test/unit/phase9-history-ui.test.js'
  ]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 09 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 09 checkpoint 1 automated verification: PASS\n');
process.stdout.write('Dashboard model + responsive renderer are gated; interactive Manager TUI runtime remains pending.\n');
