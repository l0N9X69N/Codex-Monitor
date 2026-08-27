import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Config regression plus Phase 11-1 archive foundation/repository', process.execPath, ['--test',
    'test/unit/phase4-ui.test.js',
    'test/unit/phase11-1-archive-foundation.test.js',
    'test/unit/phase11-1-archive-repository.test.js'
  ]],
  ['Phase 11 storage/delete safety regression', process.execPath, ['--test',
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

process.stdout.write('\nPhase 11-1 repository checkpoint verification: PASS\n');
process.stdout.write('Gate covers archive config/schema foundation, byte-accurate incremental reads, atomic derived-state plus committed-offset transactions, rollback safety, malformed-line recording, ARCHIVED raw-missing semantics, and Phase 11 storage/delete regressions.\n');
