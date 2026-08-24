import { spawnSync } from 'node:child_process';
import process from 'node:process';

const focused = [
  'test/unit/phase3-demand.test.js',
  'test/unit/phase3-scheduler.test.js',
  'test/unit/phase3-renderer.test.js',
  'test/unit/phase3-ring-buffer.test.js',
  'test/integration/phase3-demand-scheduler.test.js'
];

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Full regression', process.execPath, ['--test']],
  ['Phase 03 focused', process.execPath, ['--test', ...focused]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 03 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 03 automated verification: PASS\n');
process.stdout.write('Manual PTY responsiveness acceptance is still required; see docs/qa/phase-03/MANUAL-TEST-REQUIRED.md\n');
