import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Platform/data-dir regression plus Phase 11-1 archive runtime/coordinator/service/config/hooks/Manager integration', process.execPath, ['--test',
    'test/unit/phase7-platform.test.js',
    'test/unit/phase4-ui.test.js',
    'test/unit/phase11-1-archive-foundation.test.js',
    'test/unit/phase11-1-archive-repository.test.js',
    'test/unit/phase11-1-archive-database.test.js',
    'test/unit/phase11-1-archive-coordinator.test.js',
    'test/unit/phase11-1-archive-service.test.js',
    'test/unit/phase11-1-archive-integration.test.js',
    'test/unit/phase11-1-archive-config-effects.test.js',
    'test/unit/phase11-1-archive-hooks.test.js',
    'test/unit/phase11-1-manager-config.test.js',
    'test/unit/phase11-1-manager-archive-index.test.js',
    'test/unit/phase11-1-manager-index-health.test.js',
    'test/unit/phase11-1-manager-verified-detail.test.js'
  ]],
  ['Phase 11 storage/delete/input safety regression', process.execPath, ['--test',
    'test/unit/phase11-storage-delete.test.js',
    'test/unit/phase11-input.test.js',
    'test/unit/phase11-storage-render.test.js',
    'test/unit/phase11-storage-navigation.test.js',
    'test/unit/phase11-stress.test.js'
  ]]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 11-1 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 11-1 Manager verified-index and SQLite detail checkpoint verification: PASS\n');
process.stdout.write('Gate covers complete-scan READY semantics, incomplete-scan protection against false ARCHIVED state, reconcile generations that only record success after a complete source scan, SQLite-backed READY/ARCHIVED Manager inspect detail, raw HistoryEngine fallback for LIVE/not-ready sessions, visible INDEX health/wake behavior, shared Config/hooks/service/checkpoint safety, and Phase 11 storage/delete regressions.\n');
