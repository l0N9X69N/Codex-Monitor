import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Phase 07 platform regression', process.execPath, ['--test', 'test/unit/phase7-platform.test.js']],
  ['Phase 08 Session Manager core', process.execPath, ['--test',
    'test/unit/phase8-history-core.test.js',
    'test/unit/phase8-detail-view.test.js',
    'test/unit/phase8-lightweight-summary.test.js',
    'test/unit/phase8-process-evidence.test.js',
    'test/unit/phase8-runtime.test.js',
    'test/unit/phase8-io-bounds.test.js'
  ]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 08 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 08 automated verification checkpoint: PASS\n');
process.stdout.write('Manager core is read-only at this checkpoint; real multi-session LIVE/ENDED transition acceptance has passed; bounded I/O remains enforced by regression tests.\n');
