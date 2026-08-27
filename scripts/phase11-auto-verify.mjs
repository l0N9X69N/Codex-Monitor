import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Phase 09 manager regression', process.execPath, ['--test',
    'test/unit/phase9-dashboard.test.js',
    'test/unit/phase9-tui.test.js',
    'test/unit/phase9-timeline.test.js'
  ]],
  ['Phase 10 analytics regression', process.execPath, ['--test',
    'test/unit/phase10-session-analytics.test.js',
    'test/unit/phase10-analytics-robustness.test.js',
    'test/unit/phase10-layout-density.test.js'
  ]],
  ['Phase 11 storage/delete safety', process.execPath, ['--test',
    'test/unit/phase11-storage-delete.test.js'
  ]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 11 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 11 automated verification: PASS\n');
process.stdout.write('Current gate covers syntax, Manager/analytics regressions, storage summary correctness and destructive temp-session delete safety. TUI multi-select/confirmation/stress QA will be added to this same gate as Phase 11 implementation continues.\n');
