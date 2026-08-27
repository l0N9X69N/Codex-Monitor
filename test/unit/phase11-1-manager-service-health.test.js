import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openArchiveDatabase } from '../../src/archive/database.js';
import {
  ManagerArchiveVerifiedIndex,
  normalizeManagerArchiveServiceStatus
} from '../../src/manager/archive-verified-index.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-manager-service-health-'));
}

function archiveConfig() {
  return { archive: { enabled: true } };
}

test('service liveness normalizer distinguishes running, stale metadata, stale locks and owner mismatch', () => {
  const running = normalizeManagerArchiveServiceStatus({
    running: true,
    owner: { instanceId: 'svc-a', pid: 100, startedAt: 123 }
  }, 'svc-a');
  assert.equal(running.running, true);
  assert.equal(running.stale, false);
  assert.equal(running.ownerPid, 100);

  const deadMetadata = normalizeManagerArchiveServiceStatus({ running: false, owner: null }, 'svc-a');
  assert.equal(deadMetadata.running, false);
  assert.equal(deadMetadata.metadataStale, true);
  assert.equal(deadMetadata.stale, true);

  const staleLock = normalizeManagerArchiveServiceStatus({
    running: false,
    owner: { instanceId: 'svc-a', pid: 100, startedAt: 123 }
  }, null);
  assert.equal(staleLock.staleLock, true);
  assert.equal(staleLock.stale, true);

  const mismatch = normalizeManagerArchiveServiceStatus({
    running: true,
    owner: { instanceId: 'svc-b', pid: 200, startedAt: 456 }
  }, 'svc-a');
  assert.equal(mismatch.running, true);
  assert.equal(mismatch.ownerMismatch, true);
  assert.equal(mismatch.metadataStale, true);
  assert.equal(mismatch.stale, true);
});

test('Manager SQLite-first open never presents stale archive_meta service marker as a live process', () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  let seed = null;
  let index = null;
  try {
    seed = openArchiveDatabase({ dataDir, now: () => 2_600_000_000_000 });
    seed.repository.db.prepare('UPDATE archive_meta SET service_instance_id = ? WHERE singleton_id = 1').run('dead-service');
    seed.close();
    seed = null;

    index = new ManagerArchiveVerifiedIndex({
      config: archiveConfig(),
      sessionsPath: root,
      openDatabase: () => openArchiveDatabase({ dataDir }),
      readServiceStatus: () => ({ running: false, owner: null }),
      scanSourcesWithHealth: async () => ({ sources: [], complete: true, errors: [], limited: false })
    });

    const opened = index.open();
    assert.equal(opened.available, true);
    assert.equal(opened.health.serviceMetadataInstanceId, 'dead-service');
    assert.equal(opened.health.serviceInstanceId, null);
    assert.equal(opened.health.serviceStale, true);
    assert.equal(opened.serviceStatus.running, false);
    assert.equal(opened.serviceStatus.metadataStale, true);
  } finally {
    try { index?.close(); } catch {}
    try { seed?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Manager refresh trusts the live lock owner over stale archive_meta service identity', async () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  let seed = null;
  let index = null;
  try {
    seed = openArchiveDatabase({ dataDir, now: () => 2_700_000_000_000 });
    seed.repository.db.prepare('UPDATE archive_meta SET service_instance_id = ? WHERE singleton_id = 1').run('old-service');
    seed.close();
    seed = null;

    index = new ManagerArchiveVerifiedIndex({
      config: archiveConfig(),
      sessionsPath: root,
      openDatabase: () => openArchiveDatabase({ dataDir }),
      readServiceStatus: () => ({
        running: true,
        owner: { instanceId: 'live-service', pid: 321, startedAt: 2_700_000_000_000 }
      }),
      scanSourcesWithHealth: async () => ({ sources: [], complete: true, errors: [], limited: false })
    });

    index.open();
    const snapshot = await index.refresh();
    assert.equal(snapshot.health.serviceInstanceId, 'live-service');
    assert.equal(snapshot.health.serviceMetadataInstanceId, 'old-service');
    assert.equal(snapshot.health.serviceStale, true);
    assert.equal(snapshot.serviceStatus.running, true);
    assert.equal(snapshot.serviceStatus.ownerMismatch, true);
    assert.equal(snapshot.serviceStatus.ownerPid, 321);
  } finally {
    try { index?.close(); } catch {}
    try { seed?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});
