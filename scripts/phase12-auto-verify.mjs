import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Phase 12 product shell, onboarding and Config UX', process.execPath, ['--test',
    'test/unit/cli-args.test.js',
    'test/unit/phase12-product-shell-foundation.test.js',
    'test/unit/phase12-onboarding.test.js',
    'test/unit/phase12-config-ux.test.js',
    'test/unit/phase11-1-manager-config.test.js'
  ]],
  ['Full Phase 11-1 regression', process.execPath, ['./scripts/phase11-1-auto-verify.mjs']],
  ['Manager runtime/input regression', process.execPath, ['--test',
    'test/unit/phase9-tui.test.js',
    'test/unit/phase11-input.test.js'
  ]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 12 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 12 product-shell/onboarding/config-UX verification: PASS\n');
process.stdout.write('Gate covers deterministic Monitor routing, exact Codex passthrough, Manager one-shot view overrides, schema migration/setup state, first-run onboarding, shared Config persistence, production-renderer Live/Manager previews, malformed/future-config recovery without silent overwrite, atomic save-failure preservation, explicit reset confirmation, reset explicit-save safety, non-TTY no-prompt behavior, plus the full Phase 11-1 Archive/Manager regression gate.\n');
