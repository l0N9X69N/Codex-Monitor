import { spawnSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['Syntax', process.execPath, ['./scripts/check-syntax.mjs']],
  ['Full regression', process.execPath, ['--test']],
  ['Phase 02 focused', process.execPath, ['--test', 'test/unit/phase2-parsers.test.js', 'test/integration/phase2-ingest.test.js']]
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`\nPhase 02 verification FAILED at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nPhase 02 automated verification: PASS\n');
process.stdout.write('Manual PTY wording checks are optional unless a real Codex wording case is not represented by fixtures.\n');
