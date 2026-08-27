import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveHealthStore } from '../../src/archive/health-store.js';
import { ArchiveRepository } from '../../src/archive/repository.js';
import {
  acquireArchiveServiceLock,
  ensureArchiveService,
  getArchiveServicePaths,
  getArchiveServiceStatus,
  releaseArchiveServiceLock
} from '../../src/archive/service-control.js';
import { runArchiveServiceProcess } from '../../src/archive/service-entry.js';
import { ArchiveServiceRuntime } from '../../src/archive/service-runtime.js';

function tempRoot(prefix = 'codexm-phase11-1-service-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('archive disabled performs zero service spawn and creates no runtime directory', () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'not-created');
  let spawns = 0;
  try {
    const result = ensureArchiveService({
      config: { archive: { enabled: false } },
      dataDir,
      spawnProcess() { spawns += 1; throw new Error('must not spawn'); }
    });
    assert.equal(result.reason, 'archive-disabled');
    assert.equal(spawns, 0);
    assert.equal(fs.existsSync(dataDir), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('enabled service controller spawns detached internal node entry and unrefs child', () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  let call = null;
  let unrefCalled = false;
  try {
    const result = ensureArchiveService({
      config: { archive: { enabled: true } },
      dataDir,
      execPath: '/node',
      spawnProcess(command, args, options) {
        call = { command, args, options };
        return {
          pid: 321,
          once() {},
          unref() { unrefCalled = true; }
        };
      },
      processRef: { kill() { const error = new Error('missing'); error.code = 'ESRCH'; throw error; } }
    });
    assert.equal(result.started, true);
    assert.equal(result.pid, 321);
    assert.equal(call.command, '/node');
    assert.equal(call.args.length, 1);
    assert.match(call.args[0], /service-entry\.js$/);
    assert.equal(call.options.detached, true);
    assert.equal(call.options.stdio, 'ignore');
    assert.equal(call.options.env.CODEXM_DATA_HOME, path.resolve(dataDir));
    assert.equal(unrefCalled, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('service lock enforces one live owner and can be released only by that instance', () => {
  const root = tempRoot();
  try {
    const paths = getArchiveServicePaths({ dataDir: root });
    const first = acquireArchiveServiceLock({ instanceId: 'one', lockPath: paths.lockPath, dataDir: root, pid: process.pid });
    assert.equal(first.acquired, true);
    const second = acquireArchiveServiceLock({ instanceId: 'two', lockPath: paths.lockPath, dataDir: root, pid: process.pid });
    assert.equal(second.acquired, false);
    assert.equal(second.reason, 'already-running');
    assert.equal(getArchiveServiceStatus({ lockPath: paths.lockPath, dataDir: root }).running, true);
    assert.equal(releaseArchiveServiceLock({ instanceId: 'two', lockPath: paths.lockPath, dataDir: root }), false);
    assert.equal(releaseArchiveServiceLock({ instanceId: 'one', lockPath: paths.lockPath, dataDir: root }), true);
    assert.equal(getArchiveServiceStatus({ lockPath: paths.lockPath, dataDir: root }).running, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('archive health records service ownership and watcher heartbeat without stale owner clearing', () => {
  const db = new DatabaseSync(':memory:');
  const repository = new ArchiveRepository(db, { now: () => 100 }).initialize();
  const health = new ArchiveHealthStore(repository, { now: () => 200 });
  try {
    assert.equal(health.getHealth().serviceInstanceId, null);
    health.markServiceStarted('svc-1');
    assert.equal(health.getHealth().serviceInstanceId, 'svc-1');
    health.markWatcherSeen({ nowMs: 250 });
    assert.equal(health.getHealth().watcherLastSeenAt, 250);
    assert.equal(health.markServiceStopped('other').cleared, false);
    assert.equal(health.getHealth().serviceInstanceId, 'svc-1');
    assert.equal(health.markServiceStopped('svc-1').cleared, true);
    assert.equal(health.getHealth().serviceInstanceId, null);
  } finally {
    db.close();
  }
});

test('service runtime drains progressing backlog then exits after idle grace', async () => {
  let clock = 0;
  const delays = [];
  const lifecycle = [];
  const cycles = [
    { pendingFileCount: 1, results: [{ advanced: true }] },
    { pendingFileCount: 0, results: [] }
  ];
  const runtime = new ArchiveServiceRuntime({
    coordinator: { async runCycle() { return cycles.shift() ?? { pendingFileCount: 0, results: [] }; } },
    healthStore: {
      markServiceStarted(id) { lifecycle.push(['start', id]); },
      markServiceStopped(id) { lifecycle.push(['stop', id]); }
    },
    instanceId: 'svc',
    now: () => clock,
    activeDelayMs: 1,
    stalledDelayMs: 4,
    safetySweepMs: 100,
    idleGraceMs: 10,
    waitForSignal: async (ms) => { delays.push(ms); clock += ms; return 'timeout'; }
  });

  const result = await runtime.run();
  assert.equal(result.cycles, 2);
  assert.deepEqual(delays, [1, 9]);
  assert.deepEqual(lifecycle, [['start', 'svc'], ['stop', 'svc']]);
});

test('service runtime backs off stalled pending work instead of hot spinning', async () => {
  let clock = 0;
  const delays = [];
  const runtime = new ArchiveServiceRuntime({
    coordinator: { async runCycle() { return { pendingFileCount: 1, results: [{ advanced: false }] }; } },
    healthStore: {},
    instanceId: 'stalled',
    now: () => clock,
    activeDelayMs: 1,
    stalledDelayMs: 4,
    safetySweepMs: 100,
    idleGraceMs: 10,
    waitForSignal: async (ms) => { delays.push(ms); clock += ms; return 'timeout'; }
  });

  const result = await runtime.run();
  assert.equal(result.cycles, 3);
  assert.deepEqual(delays, [4, 4, 2]);
});

test('direct service entry exits before lock or SQLite when archive is disabled', async () => {
  const result = await runArchiveServiceProcess({
    loadConfig: () => ({ config: { archive: { enabled: false } } }),
    resolveCommonPaths: () => { throw new Error('must not resolve paths'); },
    getServicePaths: () => { throw new Error('must not resolve service paths'); },
    acquireLock: () => { throw new Error('must not lock'); },
    openDatabase: () => { throw new Error('must not open database'); }
  });
  assert.deepEqual(result, { code: 0, reason: 'archive-disabled' });
});
