import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveReconcileCoordinator } from '../../src/archive/coordinator.js';
import { openArchiveDatabase } from '../../src/archive/database.js';
import { clearArchive, deleteArchiveSessions } from '../../src/archive/maintenance.js';
import { deleteManagerSessions, MANAGER_DELETE_SCOPE } from '../../src/manager/storage-delete.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-maintenance-'));
}

function seedSession(opened, { sourcePath, sessionId = 'thread-maintenance', nowMs = 2_500_000_000_000 } = {}) {
  opened.repository.commitChunk({
    source: { filePath: sourcePath, fileIdentity: 'fixture:maintenance:1', size: 100, mtimeMs: nowMs },
    sessionId,
    events: [
      { kind: 'session-meta', atMs: nowMs - 1000, cwd: path.dirname(sourcePath), model: 'gpt-test', sourceOffset: 1 },
      { kind: 'turn-start', atMs: nowMs - 900, sourceOffset: 10 },
      { kind: 'usage', atMs: nowMs - 800, inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, reasoningTokens: 1, turnInputTokens: 10, turnOutputTokens: 3, sourceOffset: 20 },
      { kind: 'turn-complete', atMs: nowMs - 700, sourceOffset: 30 }
    ],
    commitOffset: 100
  });
}

test('Delete Archive cascades derived rows and suppresses an existing raw source from automatic rebuild', async () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  const sourcePath = path.join(root, 'session.jsonl');
  fs.writeFileSync(sourcePath, '{}\n');
  let opened = null;
  try {
    opened = openArchiveDatabase({ dataDir });
    seedSession(opened, { sourcePath });
    assert.equal(opened.repository.count('sessions'), 1);
    assert.equal(opened.repository.count('turns'), 1);
    opened.close();
    opened = null;

    const report = deleteArchiveSessions([{
      id: sourcePath,
      filePath: sourcePath,
      sourcePath,
      rawSourceExists: true,
      archiveBacked: true,
      threadId: 'thread-maintenance'
    }], {
      openDatabase: () => openArchiveDatabase({ dataDir }),
      now: () => 2_500_000_010_000
    });
    assert.equal(report.ok, true);
    assert.equal(report.deleted[0].suppressed, true);

    opened = openArchiveDatabase({ dataDir });
    assert.equal(opened.repository.count('sessions'), 0);
    assert.equal(opened.repository.count('turns'), 0);
    assert.equal(opened.repository.count('token_samples'), 0);
    assert.equal(opened.repository.count('ingest_state'), 0);
    assert.equal(opened.db.prepare('SELECT COUNT(*) AS count FROM archive_suppressions').get().count, 1);

    let reconciles = 0;
    const coordinator = new ArchiveReconcileCoordinator({
      sessionsPath: root,
      repository: opened.repository,
      scanSources: async () => [{
        filePath: sourcePath,
        fileIdentity: 'fixture:maintenance:1',
        size: 100,
        mtimeMs: 2_500_000_000_000
      }],
      reconcileSource: async () => {
        reconciles += 1;
        throw new Error('suppressed source must not reconcile');
      },
      yieldControl: async () => {}
    });
    const cycle = await coordinator.runCycle();
    assert.equal(reconciles, 0);
    assert.equal(cycle.processedSourceCount, 0);
    assert.equal(cycle.pendingFileCount, 0);
    assert.equal(cycle.suppressedSourceCount, 1);
  } finally {
    try { opened?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Clear Archive keeps raw JSONL and suppresses tracked sources so enabled service cannot immediately rebuild them', () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  const sourcePath = path.join(root, 'session.jsonl');
  fs.writeFileSync(sourcePath, '{"raw":true}\n');
  let opened = null;
  try {
    opened = openArchiveDatabase({ dataDir });
    seedSession(opened, { sourcePath, sessionId: 'thread-clear' });
    opened.db.prepare('INSERT INTO archive_suppressions (source_path, session_id, file_identity, suppressed_at, reason) VALUES (?, ?, ?, ?, ?)')
      .run(path.join(root, 'suppressed.jsonl'), 'thread-suppressed', 'fixture:suppressed', 1, 'test');
    opened.close();
    opened = null;

    const result = clearArchive({ openDatabase: () => openArchiveDatabase({ dataDir }), now: () => 2_500_000_020_000 });
    assert.equal(result.ok, true);
    assert.equal(result.cleared, 1);
    assert.equal(result.suppressed, 1);
    assert.equal(fs.existsSync(sourcePath), true);

    opened = openArchiveDatabase({ dataDir });
    assert.equal(opened.repository.count('sessions'), 0);
    assert.equal(opened.repository.count('ingest_state'), 0);
    assert.equal(opened.db.prepare('SELECT COUNT(*) AS count FROM archive_suppressions').get().count, 2);
    const clearedSuppression = opened.db.prepare('SELECT reason FROM archive_suppressions WHERE source_path = ?').get(sourcePath);
    assert.equal(clearedSuppression.reason, 'user-clear-archive');
  } finally {
    try { opened?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Delete Archive rejects selected rows that have no archived analytics', () => {
  const row = { id: '/sessions/raw-only.jsonl', filePath: '/sessions/raw-only.jsonl', state: 'ENDED', archiveBacked: false };
  let archiveCalls = 0;
  const report = deleteManagerSessions([row], new Set([row.id]), {
    scope: MANAGER_DELETE_SCOPE.ARCHIVE,
    deleteArchive() { archiveCalls += 1; throw new Error('must not be called'); }
  });
  assert.equal(archiveCalls, 0);
  assert.equal(report.ok, false);
  assert.equal(report.rejected[0].reason, 'archive-not-available');
});

test('Delete Everything never deletes archive evidence for rows whose raw delete failed', () => {
  const row = {
    id: '/sessions/a.jsonl', filePath: '/sessions/a.jsonl', sourcePath: '/sessions/a.jsonl', state: 'ENDED',
    archiveBacked: true, rawSourceExists: true, threadId: 'thread-a'
  };
  let archiveCalls = 0;
  const report = deleteManagerSessions([row], new Set([row.id]), {
    scope: MANAGER_DELETE_SCOPE.EVERYTHING,
    sessionsPath: '/sessions',
    deleteRaw() {
      return { requested: 1, deleted: [], rejected: [{ id: row.id, reason: 'file-changed-before-delete' }], errors: [], ok: false, partial: false };
    },
    deleteArchive() { archiveCalls += 1; throw new Error('archive must remain when raw delete fails'); }
  });
  assert.equal(archiveCalls, 0);
  assert.equal(report.deletedIds.length, 0);
  assert.equal(report.ok, false);
  assert.equal(report.rejected[0].reason, 'file-changed-before-delete');
});

test('Delete Everything removes archive only after raw success and does not create suppression', () => {
  const row = {
    id: '/sessions/a.jsonl', filePath: '/sessions/a.jsonl', sourcePath: '/sessions/a.jsonl', state: 'ENDED',
    archiveBacked: true, rawSourceExists: true, threadId: 'thread-a'
  };
  let archiveOptions = null;
  const report = deleteManagerSessions([row], new Set([row.id]), {
    scope: MANAGER_DELETE_SCOPE.EVERYTHING,
    sessionsPath: '/sessions',
    deleteRaw() {
      return { requested: 1, deleted: [{ id: row.id, filePath: row.filePath }], rejected: [], errors: [], ok: true, partial: false };
    },
    deleteArchive(rows, options) {
      assert.equal(rows.length, 1);
      archiveOptions = options;
      return { requested: 1, deleted: [{ id: row.id, sessionId: row.threadId, suppressed: false }], rejected: [], errors: [], ok: true, partial: false };
    }
  });
  assert.equal(archiveOptions.suppressRawSources, false);
  assert.deepEqual(report.deletedIds, [row.id]);
  assert.equal(report.ok, true);
});

test('Delete Everything removes archive-only sessions even when raw source is already absent', () => {
  const row = {
    id: 'archive:thread-old', filePath: null, sourcePath: '/sessions/old.jsonl', state: 'ARCHIVED',
    archiveBacked: true, rawSourceExists: false, threadId: 'thread-old'
  };
  let rawCalls = 0;
  const report = deleteManagerSessions([row], new Set([row.id]), {
    scope: MANAGER_DELETE_SCOPE.EVERYTHING,
    deleteRaw() { rawCalls += 1; throw new Error('raw delete must not run'); },
    deleteArchive(rows, options) {
      assert.equal(rows.length, 1);
      assert.equal(options.suppressRawSources, false);
      return { requested: 1, deleted: [{ id: row.id, sessionId: row.threadId, suppressed: false }], rejected: [], errors: [], ok: true, partial: false };
    }
  });
  assert.equal(rawCalls, 0);
  assert.deepEqual(report.deletedIds, [row.id]);
  assert.equal(report.ok, true);
});
