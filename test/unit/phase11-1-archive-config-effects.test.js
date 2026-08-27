import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArchiveConfigSideEffects } from '../../src/config/archive-effects.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../../src/config/schema.js';
import {
  acquireArchiveServiceLock,
  consumeArchiveServiceStopRequest,
  getArchiveServicePaths,
  requestArchiveServiceStop,
  releaseArchiveServiceLock
} from '../../src/archive/service-control.js';
import { ArchiveServiceRuntime } from '../../src/archive/service-runtime.js';

function config(enabled) {
  return normalizeConfig({ ...DEFAULT_CONFIG, archive: { ...DEFAULT_CONFIG.archive, enabled } });
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-config-'));
}

test('OFF to ON bootstraps SQLite, installs hooks, then starts service', () => {
  const order = [];
  let closed = false;
  const result = applyArchiveConfigSideEffects(config(false), config(true), {
    openDatabase() {
      order.push('db');
      return { filePath: '/archive.sqlite3', close() { closed = true; order.push('close'); } };
    },
    installHooks() {
      order.push('hooks');
      return { installed: true, changed: true, trustRequired: true, error: null };
    },
    kickService(next) {
      order.push('service');
      assert.equal(next.archive.enabled, true);
      return { started: true, running: true, reason: 'spawned', error: null };
    }
  });

  assert.deepEqual(order, ['db', 'close', 'hooks', 'service']);
  assert.equal(closed, true);
  assert.equal(result.transition, 'off-to-on');
  assert.equal(result.ok, true);
  assert.equal(result.bootstrap.initialized, true);
  assert.equal(result.hooks.installed, true);
});

test('OFF to ON remains service-capable when hook install needs attention', () => {
  let services = 0;
  const result = applyArchiveConfigSideEffects(config(false), config(true), {
    openDatabase() { return { filePath: '/archive.sqlite3', close() {} }; },
    installHooks() { return { installed: false, changed: false, error: 'invalid-hooks-json' }; },
    kickService() {
      services += 1;
      return { started: true, running: true, error: null };
    }
  });
  assert.equal(services, 1);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'invalid-hooks-json');
});

test('ON to OFF removes Monitor hooks and requests service stop without opening or deleting archive database', () => {
  let opens = 0;
  let removals = 0;
  let stops = 0;
  const result = applyArchiveConfigSideEffects(config(true), config(false), {
    openDatabase() { opens += 1; throw new Error('must not open'); },
    uninstallHooks() { removals += 1; return { removed: true, changed: true, error: null }; },
    requestStop() { stops += 1; return { requested: true, reason: 'stop-requested' }; }
  });
  assert.equal(opens, 0);
  assert.equal(removals, 1);
  assert.equal(stops, 1);
  assert.equal(result.transition, 'on-to-off');
  assert.equal(result.ok, true);
});

test('unchanged archive state has zero runtime side effects', () => {
  let calls = 0;
  const deps = {
    openDatabase() { calls += 1; },
    installHooks() { calls += 1; },
    uninstallHooks() { calls += 1; },
    kickService() { calls += 1; },
    requestStop() { calls += 1; }
  };
  assert.equal(applyArchiveConfigSideEffects(config(false), config(false), deps).changed, false);
  assert.equal(applyArchiveConfigSideEffects(config(true), config(true), deps).changed, false);
  assert.equal(calls, 0);
});

test('targeted stop request can only be consumed by the current service instance', () => {
  const root = tempRoot();
  try {
    const paths = getArchiveServicePaths({ dataDir: root });
    const lock = acquireArchiveServiceLock({ instanceId: 'svc-a', pid: process.pid, dataDir: root, lockPath: paths.lockPath });
    assert.equal(lock.acquired, true);
    const request = requestArchiveServiceStop({ dataDir: root, stopPath: paths.stopPath });
    assert.equal(request.requested, true);
    assert.equal(consumeArchiveServiceStopRequest({ instanceId: 'svc-b', dataDir: root, stopPath: paths.stopPath }), false);
    assert.equal(fs.existsSync(paths.stopPath), true);
    assert.equal(consumeArchiveServiceStopRequest({ instanceId: 'svc-a', dataDir: root, stopPath: paths.stopPath }), true);
    assert.equal(fs.existsSync(paths.stopPath), false);
    releaseArchiveServiceLock({ instanceId: 'svc-a', dataDir: root, lockPath: paths.lockPath });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('service runtime honors safety-path stop check even without watcher delivery', async () => {
  let checks = 0;
  let cycles = 0;
  const runtime = new ArchiveServiceRuntime({
    coordinator: { async runCycle() { cycles += 1; return { pendingFileCount: 0, results: [] }; } },
    healthStore: {},
    instanceId: 'svc',
    shouldStop() { checks += 1; return checks >= 2; },
    waitForSignal: async () => 'timeout',
    safetySweepMs: 1,
    idleGraceMs: 100
  });
  const result = await runtime.run();
  assert.equal(cycles, 1);
  assert.equal(result.stopped, true);
});
