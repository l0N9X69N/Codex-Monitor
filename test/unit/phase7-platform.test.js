import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_METHODS, assertPlatformAdapter } from '../../src/platform/contract.js';
import { createFakePlatformAdapter } from '../../src/platform/fake.js';
import { createPlatformAdapter } from '../../src/platform/index.js';
import { commonPaths } from '../../src/platform/common.js';
import { elapsedToMs } from '../../src/platform/posix.js';

test('fake platform adapter satisfies full contract and records calls', async () => {
  const adapter = createFakePlatformAdapter({ paths: { sessions: '/tmp/sessions' } });
  assertPlatformAdapter(adapter);
  for (const method of PLATFORM_METHODS) assert.equal(typeof adapter[method], 'function');
  await adapter.getSystemUsage();
  await adapter.getProcessTree(42);
  await adapter.getDiskInfo('/repo');
  assert.ok(adapter.calls.some((item) => item.name === 'getProcessTree' && item.value === 42));
});

test('resolver exposes distinct adapters without executing platform-specific commands', () => {
  assert.equal(createPlatformAdapter({ platform: 'win32', env: {} }).id, 'win32');
  assert.equal(createPlatformAdapter({ platform: 'linux', env: {} }).id, 'linux');
  assert.equal(createPlatformAdapter({ platform: 'darwin', env: {} }).id, 'darwin');
  assert.throws(() => createPlatformAdapter({ platform: 'plan9', env: {} }), /unsupported platform/);
});

test('Codex paths honor CODEX_HOME without platform fabrication', () => {
  const paths = commonPaths({ env: { CODEX_HOME: '/safe/codex-home' }, homedir: '/home/u' });
  assert.ok(paths.sessions.endsWith('sessions'));
  assert.ok(paths.auth.endsWith('auth.json'));
  assert.ok(paths.config.endsWith('config.toml'));
});

test('POSIX elapsed parser accepts ss, mm:ss, hh:mm:ss and days-hh:mm:ss', () => {
  assert.equal(elapsedToMs('9'), 9000);
  assert.equal(elapsedToMs('01:09'), 69000);
  assert.equal(elapsedToMs('02:01:09'), 7269000);
  assert.equal(elapsedToMs('1-02:01:09'), 93669000);
});
