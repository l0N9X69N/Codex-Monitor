import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_METHODS, assertPlatformAdapter, normalizeCapabilities, unsupportedResult } from '../../src/platform/contract.js';
import { createFakePlatformAdapter } from '../../src/platform/fake.js';
import { createPlatformAdapter } from '../../src/platform/index.js';
import { commonPaths, normalizeProcessRecord } from '../../src/platform/common.js';
import { elapsedToMs, parseDf, parsePs } from '../../src/platform/posix.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function assertSystemShape(value) {
  for (const key of ['cpuPercent', 'memoryBytes', 'totalMemoryBytes', 'freeMemoryBytes']) {
    assert.ok(Object.prototype.hasOwnProperty.call(value, key), `missing ${key}`);
    assert.ok(value[key] == null || Number.isFinite(value[key]), `${key} must be number|null`);
  }
}

function assertDiskShape(value) {
  assert.equal(typeof value.path, 'string');
  assert.ok(value.totalBytes == null || Number.isFinite(value.totalBytes));
  assert.ok(value.freeBytes == null || Number.isFinite(value.freeBytes));
}

test('platform contract contains only current cross-platform primitives', () => {
  assert.deepEqual(PLATFORM_METHODS, [
    'spawnPty',
    'getSystemUsage',
    'getProcessTree',
    'getDiskInfo',
    'paths',
    'capabilities',
    'cleanup'
  ]);
  assert.equal(PLATFORM_METHODS.includes('openHistoryTerminal'), false);
});

test('platform-specific branching stays behind src/platform', () => {
  const srcRoot = path.join(ROOT, 'src');
  const platformRoot = path.join(srcRoot, 'platform') + path.sep;
  const leaks = [];
  for (const file of sourceFiles(srcRoot)) {
    if (file.startsWith(platformRoot)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/process\.platform/.test(text)) leaks.push(path.relative(ROOT, file));
  }
  assert.deepEqual(leaks, [], `process.platform leaked outside platform adapter: ${leaks.join(', ')}`);
});

test('obsolete Monitor History launcher is absent from runtime source', () => {
  const hits = [];
  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    if (/openHistoryTerminal/.test(text)) hits.push(path.relative(ROOT, file));
  }
  assert.deepEqual(hits, [], `obsolete openHistoryTerminal found in: ${hits.join(', ')}`);
});

test('fake platform adapter satisfies full contract and records calls', async () => {
  const adapter = createFakePlatformAdapter({ paths: { sessions: '/tmp/sessions' } });
  assertPlatformAdapter(adapter);
  for (const method of PLATFORM_METHODS) assert.equal(typeof adapter[method], 'function');
  const system = await adapter.getSystemUsage();
  const processes = await adapter.getProcessTree(42);
  const disk = await adapter.getDiskInfo('/repo');
  assertSystemShape(system);
  assert.deepEqual(processes, []);
  assertDiskShape(disk);
  assert.ok(adapter.calls.some((item) => item.name === 'getProcessTree' && item.value === 42));
});

test('resolver exposes distinct adapters without executing platform-specific commands', () => {
  const windows = createPlatformAdapter({ platform: 'win32', env: {} });
  const linux = createPlatformAdapter({ platform: 'linux', env: {} });
  const macos = createPlatformAdapter({ platform: 'darwin', env: {} });
  assert.equal(windows.id, 'win32');
  assert.equal(linux.id, 'linux');
  assert.equal(macos.id, 'darwin');
  for (const adapter of [windows, linux, macos]) assertPlatformAdapter(adapter);
  assert.throws(() => createPlatformAdapter({ platform: 'plan9', env: {} }), /unsupported platform/);
});

test('capability shape is stable and does not advertise obsolete history launcher', () => {
  const caps = normalizeCapabilities({ pty: true, mouse: false, caseInsensitivePaths: true });
  assert.deepEqual(Object.keys(caps), [
    'pty', 'systemUsage', 'processTree', 'diskInfo', 'mouse', 'truecolor', 'caseInsensitivePaths'
  ]);
  assert.equal(caps.pty, true);
  assert.equal(caps.mouse, false);
  assert.equal(caps.caseInsensitivePaths, true);
  assert.equal(Object.prototype.hasOwnProperty.call(caps, 'historyTerminal'), false);
});

test('Codex paths honor CODEX_HOME without platform fabrication', () => {
  const paths = commonPaths({ env: { CODEX_HOME: '/safe/codex-home' }, homedir: '/home/u' });
  assert.ok(paths.sessions.endsWith('sessions'));
  assert.ok(paths.auth.endsWith('auth.json'));
  assert.ok(paths.config.endsWith('config.toml'));
});

test('normalized process records preserve zero and use null for unknown numbers', () => {
  assert.deepEqual(normalizeProcessRecord({ pid: 7, ppid: 1, name: 'codex', command: 'codex', cpuPercent: 0, memoryBytes: 0, ageMs: 0 }), {
    pid: 7,
    ppid: 1,
    name: 'codex',
    command: 'codex',
    cpuPercent: 0,
    memoryBytes: 0,
    ageMs: 0
  });
  const unknown = normalizeProcessRecord({ name: 'x' });
  assert.equal(unknown.pid, null);
  assert.equal(unknown.cpuPercent, null);
  assert.equal(unknown.memoryBytes, null);
});

test('POSIX elapsed parser accepts ss, mm:ss, hh:mm:ss and days-hh:mm:ss', () => {
  assert.equal(elapsedToMs('9'), 9000);
  assert.equal(elapsedToMs('01:09'), 69000);
  assert.equal(elapsedToMs('02:01:09'), 7269000);
  assert.equal(elapsedToMs('1-02:01:09'), 93669000);
});

test('POSIX ps parser normalizes process rows', () => {
  const rows = parsePs('123 1 codex 12.5 2048 01:02 codex --foo\n');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    pid: 123,
    ppid: 1,
    name: 'codex',
    command: 'codex --foo',
    cpuPercent: 12.5,
    memoryBytes: 2 * 1024 * 1024,
    ageMs: 62000
  });
});

test('POSIX df parser returns normalized capacity and mount path', () => {
  const disk = parseDf('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 1000 400 600 40% /workspace\n', '/repo');
  assert.deepEqual(disk, { path: '/workspace', totalBytes: 1024000, freeBytes: 614400 });
});

test('unsupported result is explicit and never fabricates a value', () => {
  assert.deepEqual(unsupportedResult('diskInfo', 'missing df'), {
    supported: false,
    feature: 'diskInfo',
    detail: 'missing df',
    value: null
  });
});

test('cleanup contract is idempotent for fake and concrete adapters', async () => {
  const adapters = [
    createFakePlatformAdapter(),
    createPlatformAdapter({ platform: 'win32', env: {} }),
    createPlatformAdapter({ platform: 'linux', env: {} }),
    createPlatformAdapter({ platform: 'darwin', env: {} })
  ];
  for (const adapter of adapters) {
    assert.equal(await adapter.cleanup(), true);
    assert.equal(await adapter.cleanup(), true);
  }
});
