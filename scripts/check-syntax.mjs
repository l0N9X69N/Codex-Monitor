import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const roots = ['src', 'scripts', 'test'];
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|mjs)$/.test(entry.name) && !full.endsWith(path.join('scripts', 'check-syntax.mjs'))) files.push(full);
  }
}

for (const root of roots) walk(root);

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
}

if (failed) {
  process.stderr.write(`Syntax check failed for ${failed} file(s).\n`);
  process.exit(1);
}
process.stdout.write(`Syntax check passed: ${files.length} file(s).\n`);
