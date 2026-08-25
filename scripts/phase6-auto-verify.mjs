import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Core correctness smoke', process.execPath, ['--test',
    'test/unit/activity.test.js',
    'test/unit/auth.test.js',
    'test/unit/freshness.test.js',
    'test/unit/host-lifecycle.test.js',
    'test/unit/cli-args.test.js',
    'test/unit/phase2-parsers.test.js'
  ]],
  ['Demand/scheduler/diff regression', process.execPath, ['--test',
    'test/unit/phase3-demand.test.js',
    'test/unit/phase3-scheduler.test.js',
    'test/unit/phase3-renderer.test.js',
    'test/unit/phase3-ring-buffer.test.js',
    'test/integration/phase3-demand-scheduler.test.js'
  ]],
  ['Focused Phase 06 passive Live', process.execPath, ['--test',
    'test/unit/phase6-passive-hud.test.js',
    'test/unit/phase6-bootstrap.test.js',
    'test/integration/phase6-passive-runtime.test.js'
  ]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 06 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 06 automated verification: PASS\n');
process.stdout.write('Manual Windows visual/input/resize/restore acceptance is still required before closing Phase 06.\n');
