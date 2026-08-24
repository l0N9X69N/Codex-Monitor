import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Full regression', process.execPath, ['--test']],
  ['Phase 04 focused', process.execPath, ['--test', 'test/unit/phase4-ui.test.js', 'test/integration/phase4-live-pane.test.js']]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 04 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 04 automated verification: PASS\n');
process.stdout.write('Manual responsive/visual acceptance is still required; see docs/qa/phase-04/MANUAL-TEST-REQUIRED.md\n');
