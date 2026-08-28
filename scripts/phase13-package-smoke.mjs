import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function runNpm(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return spawnSync(process.execPath, [npmExecPath, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env
    });
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npmCommand, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    shell: process.platform === 'win32'
  });
}

const result = runNpm(['pack', '--dry-run', '--json', '--ignore-scripts']);

if (result.status !== 0) {
  const detail = result.stderr || result.stdout || result.error?.message || 'npm pack --dry-run failed';
  process.stderr.write(`${String(detail).trimEnd()}\n`);
  process.exit(result.status ?? 1);
}

let payload;
try {
  payload = JSON.parse(result.stdout);
} catch {
  process.stderr.write('Could not parse npm pack --dry-run JSON output.\n');
  if (result.stdout) process.stderr.write(`${result.stdout.trimEnd()}\n`);
  process.exit(1);
}

const pack = Array.isArray(payload) ? payload[0] : payload;
const files = (pack?.files ?? []).map((entry) => String(entry.path ?? entry).replaceAll('\\', '/'));
const required = [
  'package.json',
  'src/cli/codexm.js',
  'src/cli/codexmm.js',
  'src/cli/codexmc.js',
  'src/cli/codexmh.js',
  'src/cli/codexmctl.js',
  'src/cli/help.js',
  'README.md',
  'LICENSE'
];
for (const file of required) {
  if (!files.includes(file)) {
    process.stderr.write(`Package smoke FAILED: missing ${file}\n`);
    process.exit(1);
  }
}

const forbidden = files.filter((file) => /(^|\/)(archive\.sqlite3(?:-(?:wal|shm))?|auth\.json|config\.json|node_modules)(\/|$)/i.test(file)
  || /(^|\/)\.codex(\/|$)/i.test(file));
if (forbidden.length) {
  process.stderr.write(`Package smoke FAILED: forbidden runtime/local files: ${forbidden.join(', ')}\n`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const expectedBins = {
  codexm: './src/cli/codexm.js',
  codexmm: './src/cli/codexmm.js',
  codexmc: './src/cli/codexmc.js',
  codexmh: './src/cli/codexmh.js',
  codexmctl: './src/cli/codexmctl.js'
};
for (const [name, entry] of Object.entries(expectedBins)) {
  if (manifest.bin?.[name] !== entry) {
    process.stderr.write(`Package smoke FAILED: ${name} bin is not exposed correctly.\n`);
    process.exit(1);
  }
}
if (!String(manifest.engines?.node ?? '').includes('>=22.13')) {
  process.stderr.write('Package smoke FAILED: Node >=22.13 runtime contract is missing.\n');
  process.exit(1);
}

process.stdout.write(`Package smoke passed: ${files.length} file(s), ${pack?.size ?? 'unknown'} bytes packed.\n`);
