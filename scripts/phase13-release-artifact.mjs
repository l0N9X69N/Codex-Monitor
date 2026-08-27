import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['pack', '--ignore-scripts', '--pack-destination', outDir, '--json'], {
  cwd: root,
  encoding: 'utf8',
  env: process.env
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'npm pack failed\n');
  process.exit(result.status ?? 1);
}

let payload;
try { payload = JSON.parse(result.stdout); } catch {
  process.stderr.write('Could not parse npm pack JSON output.\n');
  process.exit(1);
}
const pack = Array.isArray(payload) ? payload[0] : payload;
const filename = String(pack?.filename ?? '');
if (!filename) {
  process.stderr.write('npm pack did not report an artifact filename.\n');
  process.exit(1);
}
const artifactPath = path.join(outDir, filename);
const digest = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
const checksumPath = path.join(outDir, 'SHA256SUMS');
fs.writeFileSync(checksumPath, `${digest}  ${filename}${os.EOL}`, 'utf8');
process.stdout.write(`Release artifact: ${artifactPath}\nSHA256: ${digest}\nChecksums: ${checksumPath}\n`);
