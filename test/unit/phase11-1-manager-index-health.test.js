import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanArchiveSourcesWithHealth } from '../../src/archive/source-scan.js';
import {
  managerArchiveBadge,
  managerArchiveStatusFromResult,
  managerArchiveStatusToken,
  managerSelectedArchiveBadge
} from '../../src/manager/index-status.js';
import { SessionManagerCore } from '../../src/manager/session-core.js';
import { SessionManagerRuntime, sessionManagerSnapshotSignature } from '../../src/manager/runtime.js';
import { SessionManagerTracker, archiveNeedsWake } from '../../src/manager/tracker.js';

test('Manager archive health badge exposes READY pending service and fallback states', () => {
  const ready = managerArchiveStatusFromResult({
    archiveEnabled: true,
    archiveAvailable: true,
    archiveSourceScanComplete: true,
    archiveSyncState: 'READY',
    archiveServiceInstanceId: 'svc-1'
  });
  assert.equal(managerArchiveBadge(ready), 'INDEX ● READY · svc:on');
  assert.equal(managerArchiveStatusToken(ready), 'live');

  const pending = managerArchiveStatusFromResult({
    archiveEnabled: true,
    archiveAvailable: true,
    archiveSyncState: 'CATCHING_UP',
    archivePendingFileCount: 2,
    archivePendingByteCount: 2048,
    archiveWake: { running: true }
  });
  assert.match(managerArchiveBadge(pending), /INDEX ○ CATCHING_UP · svc:wake · 2f\/2\.0K/);
  assert.equal(managerArchiveStatusToken(pending), 'pressure');

  const fallback = managerArchiveStatusFromResult({
    archiveEnabled: true,
    archiveAvailable: false,
    archiveError: 'database missing'
  });
  assert.equal(managerArchiveBadge(fallback), 'INDEX ! FALLBACK · DB ERROR');
  assert.equal(managerArchiveStatusToken(fallback), 'error');

  assert.equal(
    managerSelectedArchiveBadge({ archiveSyncState: 'UNINDEXED', archiveBacked: false }),
    'SELECTED INDEX UNINDEXED · JSONL'
  );
});

test('Manager tracker wakes stale archive at most once per cooldown', async () => {
  let nowMs = 1000;
  let wakes = 0;
  const core = new SessionManagerCore({ sessionsPath: path.resolve('/missing-health-sessions') });
  const snapshot = {
    enabled: true,
    available: true,
    sourceScanComplete: true,
    globalSyncState: 'CATCHING_UP',
    rows: [],
    pendingFileCount: 1,
    pendingByteCount: 100,
    health: null,
    error: null
  };
  const archiveIndex = {
    enabled: true,
    config: { archive: { enabled: true } },
    lastSnapshot: null,
    open: () => snapshot,
    refresh: async () => snapshot,
    close() {}
  };
  const tracker = new SessionManagerTracker({
    core,
    archiveIndex,
    archiveWake: () => {
      wakes += 1;
      return { attempted: true, running: true, reason: 'already-running' };
    },
    archiveWakeIntervalMs: 5000,
    now: () => nowMs
  });

  await tracker.tick();
  assert.equal(wakes, 1);
  nowMs = 2000;
  await tracker.tick();
  assert.equal(wakes, 1);
  nowMs = 7000;
  await tracker.tick();
  assert.equal(wakes, 2);
  assert.equal(archiveNeedsWake({ ...snapshot, globalSyncState: 'READY', pendingFileCount: 0, pendingByteCount: 0 }), false);
});

test('injected archive index is side-effect free unless archiveWake is explicitly injected', async () => {
  const core = new SessionManagerCore({ sessionsPath: path.resolve('/missing-injected-index') });
  const archiveIndex = {
    enabled: true,
    lastSnapshot: null,
    open: () => ({
      enabled: true,
      available: true,
      sourceScanComplete: false,
      globalSyncState: 'CATCHING_UP',
      rows: [],
      pendingFileCount: 1,
      pendingByteCount: 1,
      health: null,
      error: null
    }),
    refresh: async () => ({
      enabled: true,
      available: true,
      sourceScanComplete: true,
      globalSyncState: 'READY',
      rows: [],
      pendingFileCount: 0,
      pendingByteCount: 0,
      health: null,
      error: null
    })
  };
  const tracker = new SessionManagerTracker({ core, archiveIndex, now: () => 1 });
  await tracker.tick();
  assert.equal(tracker.lastArchiveWake, null);
});

test('runtime snapshot signature repaints when only archive service health changes', () => {
  const base = {
    rows: [],
    processDiagnostics: {},
    archiveEnabled: true,
    archiveAvailable: true,
    archiveSourceScanComplete: true,
    archiveSyncState: 'CATCHING_UP',
    archivePendingFileCount: 1,
    archivePendingByteCount: 10,
    archiveServiceInstanceId: null,
    archiveReconcileGeneration: 1
  };
  const next = {
    ...base,
    archivePendingFileCount: 0,
    archivePendingByteCount: 0,
    archiveServiceInstanceId: 'svc-2',
    archiveReconcileGeneration: 2,
    archiveSyncState: 'READY'
  };
  assert.notEqual(sessionManagerSnapshotSignature(base), sessionManagerSnapshotSignature(next));
});

test('archive metadata scan reports incomplete coverage instead of silently skipping errors', async () => {
  const fakeFs = {
    async readdir(target) {
      if (target.endsWith('root')) {
        return [
          { name: 'ok.jsonl', isDirectory: () => false, isFile: () => true },
          { name: 'bad', isDirectory: () => true, isFile: () => false }
        ];
      }
      const error = new Error('permission denied');
      error.code = 'EACCES';
      throw error;
    },
    async stat() {
      return { isFile: () => true, size: 12, mtimeMs: 123, dev: 1, ino: 2, birthtimeMs: 3 };
    }
  };

  const result = await scanArchiveSourcesWithHealth(path.resolve('/virtual/root'), { fsRef: fakeFs });
  assert.equal(result.sources.length, 1);
  assert.equal(result.complete, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].operation, 'readdir');
});
