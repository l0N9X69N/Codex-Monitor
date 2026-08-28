import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Phase 13 productization controls', process.execPath, ['--test',
    'test/unit/phase13-productization.test.js',
    'test/unit/phase13-cli-family.test.js',
    'test/unit/cli-args.test.js',
    'test/unit/phase12-control-plane.test.js'
  ]],
  ['Phase 12 + Phase 11-1 release regression', process.execPath, ['./scripts/phase12-auto-verify.mjs']],
  ['Full repository regression', process.execPath, ['--test']],
  ['Package smoke', process.execPath, ['./scripts/phase13-package-smoke.mjs']]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 13 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 13 release-candidate auto verification: PASS\n');
process.stdout.write('Gate covers transparent Codex passthrough, dedicated Monitor CLI routing, bilingual help, updater fail-soft/throttle behavior, uninstall ownership safety, diagnostics privacy, Archive OFF zero-service assertion, full Phase 12/11-1 regressions, full repository tests, and npm package smoke.\n');
process.stdout.write('Real-machine release/manual UX, platform-specific Archive integration, performance baseline, signing/timestamping and final visual approval remain manual RC gates.\n');
