import { spawnSync } from 'node:child_process';
import process from 'node:process';

const focused = [
  'test/unit/phase6-live-views.test.js',
  'test/unit/phase7-platform.test.js',
  'test/unit/phase8-history-core.test.js',
  'test/unit/phase9-history-ui.test.js',
  'test/integration/phase6-9-live-runtime.test.js'
];

const env = {
  ...process.env,
  CODEXM_PHASE5_FUZZ_SEED: process.env.CODEXM_PHASE5_FUZZ_SEED ?? '1592594996',
  CODEXM_PHASE5_FUZZ_ITERATIONS: process.env.CODEXM_PHASE5_FUZZ_ITERATIONS ?? '4000'
};

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Full cumulative regression', process.execPath, ['--test']],
  ['Focused Phase 06-09', process.execPath, ['--test', ...focused]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    process.stderr.write(`\nBatch Phase 06-09 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nBatch Phase 06-09 automated verification: PASS\n');
process.stdout.write('Windows manual integration is still required. Linux/macOS remain UNVERIFIED PLATFORM until tested on real machines.\n');
process.stdout.write('See docs/qa/phase-06 through phase-09 for manual gates.\n');
