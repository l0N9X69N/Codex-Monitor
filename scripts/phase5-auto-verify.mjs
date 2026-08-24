import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Full regression', process.execPath, ['--test']],
  ['Phase 05 focused', process.execPath, ['--test', 'test/unit/phase5-snapshots.test.js', 'test/unit/phase5-ux-gate.test.js', 'test/fuzz/phase5-layout-fuzz.test.js', 'test/integration/phase5-live-pane-hysteresis.test.js']]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      CODEXM_PHASE5_FUZZ_SEED: process.env.CODEXM_PHASE5_FUZZ_SEED ?? '1592594996',
      CODEXM_PHASE5_FUZZ_ITERATIONS: process.env.CODEXM_PHASE5_FUZZ_ITERATIONS ?? '4000'
    }
  });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 05 verification FAILED at: ${label}\n`);
    process.stderr.write(`Re-run with CODEXM_PHASE5_FUZZ_SEED=${process.env.CODEXM_PHASE5_FUZZ_SEED ?? '1592594996'} when reproducing fuzz failures.\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 05 automated verification: PASS\n');
process.stdout.write('Manual UX visual acceptance is still required; see docs/qa/phase-05/MANUAL-TEST-REQUIRED.md\n');
