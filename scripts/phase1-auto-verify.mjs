import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Tests', process.execPath, ['--test']]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 01 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 01 automated verification: PASS\n');
process.stdout.write('Manual terminal/PTY acceptance is still required; see docs/qa/phase-01/MANUAL-TEST-REQUIRED.md\n');
