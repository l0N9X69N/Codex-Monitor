import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kickArchiveService } from '../../src/archive/integration.js';
import { compareVersions, checkForUpdates } from '../../src/product/update.js';
import { uninstallMonitorIntegration } from '../../src/product/uninstall.js';
import { PRODUCT_VERSION } from '../../src/product/meta.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('product version is sourced from package manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(PRODUCT_VERSION, manifest.version);
});

test('release comparison handles stable and prerelease versions', () => {
  assert.equal(compareVersions('1.0.1', '1.0.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.1'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0-alpha.9'), 1);
  assert.equal(compareVersions('broken', '1.0.0'), null);
});

test('update check is fail-soft and never installs anything', async () => {
  const available = await checkForUpdates({
    currentVersion: '1.0.0',
    fetchJson: async () => ({ tag_name: 'v1.1.0', html_url: 'https://example.invalid/release' })
  });
  assert.equal(available.ok, true);
  assert.equal(available.updateAvailable, true);
  assert.equal(available.latestVersion, '1.1.0');

  const failed = await checkForUpdates({
    currentVersion: '1.0.0',
    fetchJson: async () => { throw new Error('network should not block product'); }
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.updateAvailable, false);
  assert.equal(failed.error, 'update-check-unavailable');
});

test('Archive disabled produces zero service kick activity', () => {
  let calls = 0;
  const result = kickArchiveService({ archive: { enabled: false } }, {
    ensureService() { calls += 1; throw new Error('must not run'); }
  });
  assert.equal(calls, 0);
  assert.equal(result.attempted, false);
  assert.equal(result.reason, 'archive-disabled');
});

test('uninstall removes only Monitor-owned integration and preserves all user data classes', () => {
  let hookCalls = 0;
  let stopCalls = 0;
  const result = uninstallMonitorIntegration({
    uninstallHooks() { hookCalls += 1; return { removed: true, changed: true, error: null }; },
    requestStop() { stopCalls += 1; return { requested: true, running: true }; }
  });
  assert.equal(result.ok, true);
  assert.equal(hookCalls, 1);
  assert.equal(stopCalls, 1);
  assert.deepEqual(result.preserved, {
    codexAuth: true,
    codexSessions: true,
    archiveDatabase: true,
    monitorConfig: true
  });
});

test('package manifest exposes codexm and excludes local runtime data by allowlist', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.bin?.codexm, './src/cli/codexm.js');
  assert.ok(Array.isArray(manifest.files));
  assert.ok(manifest.files.includes('src/'));
  assert.ok(!manifest.files.some((entry) => /archive\.sqlite|\.codex|node_modules/i.test(entry)));
  assert.match(manifest.engines?.node ?? '', />=22\.13/);
});
