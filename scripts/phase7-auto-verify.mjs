import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Phase 07 platform contract', process.execPath, ['--test', 'test/unit/phase7-platform.test.js']],
  ['Live/platform integration regression', process.execPath, ['--test',
    'test/unit/auth.test.js',
    'test/unit/host-lifecycle.test.js',
    'test/unit/phase6-passive-hud.test.js',
    'test/integration/phase6-passive-runtime.test.js'
  ]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 07 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 07 automated verification: PASS\n');
process.stdout.write('Windows manual platform acceptance is still required. Linux/macOS remain UNVERIFIED until tested on real environments or CI.\n');
