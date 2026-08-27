import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE_PARSER_VERSION, ARCHIVE_SYNC_STATE } from '../../src/archive/constants.js';
import { ArchiveReconcileCoordinator } from '../../src/archive/coordinator.js';
import { ArchiveHealthStore } from '../../src/archive/health-store.js';
import { reconcileArchiveSource } from '../../src/archive/reconcile.js';
import { ArchiveRepository } from '../../src/archive/repository.js';
import { withSqliteRetry } from '../../src/archive/sqlite-retry.js';
import { readArchiveConfigHealth } from '../../src/manager/archive-config-panel.js';

function busyError(message = 'database is locked') {
  const error = new Error(message);
  error.code = 'SQLITE_BUSY';
  return error;
}

function fakeHealthStore() {
  let generation = 0;
  return {
    listTrackedRawSources() { return []; },
    beginGeneration() { generation += 1; return generation; },
    recordIngestError() {},
    summarizePending() { return { pendingFileCount: 1, pendingByteCount: 100 }; },
    finishGeneration({ generation: current, ...rest }) {
      return { applied: current === generation, health: { reconcileGeneration: generation, failedFileCount: 0, ...rest } };
    }
  };
}

test('bounded SQLite retry recovers from transient BUSY without unbounded spinning', () => {
  let attempts = 0;
  const delays = [];
  const value = withSqliteRetry(() => {
    attempts += 1;
    if (attempts < 3) throw busyError();
    return 'committed';
  }, {
    attempts: 4,
    baseDelayMs: 5,
    maxDelayMs: 20,
    sleep: (ms) => delays.push(ms)
  });

  assert.equal(value, 'committed');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [5, 10]);

  let exhausted = 0;
  assert.throws(() => withSqliteRetry(() => {
    exhausted += 1;
    throw busyError('SQLITE_BUSY forever');
  }, { attempts: 3, sleep: () => {} }), /BUSY/);
  assert.equal(exhausted, 3);
});

test('reconcile retries the same atomic commit chunk after transient SQLite BUSY', async () => {
  let commits = 0;
  const repository = {
    getIngestState() { return null; },
    commitChunk(payload) {
      commits += 1;
      assert.equal(payload.commitOffset, 10);
      if (commits === 1) throw busyError();
      return { committedOffset: 10, advanced: true, eventCount: payload.events.length };
    }
  };

  const result = await reconcileArchiveSource({
    filePath: '/archive/live.jsonl',
    repository,
    inspectSource: async () => ({ exists: true, filePath: '/archive/live.jsonl', fileIdentity: 'live:1', size: 10, mtimeMs: 100 }),
    readChunk: async () => ({
      truncated: false,
      fileIdentity: 'live:1',
      observedFileSize: 10,
      observedMtimeMs: 100,
      commitCandidateOffset: 10,
      pendingPartialBytes: 0,
      bytesRead: 10,
      lines: []
    }),
    normalizeLines: () => ({ sessionId: 'thread-live', events: [], parseErrors: [] }),
    sqliteRetryOptions: { attempts: 3, sleep: () => {} }
  });

  assert.equal(commits, 2);
  assert.equal(result.state, ARCHIVE_SYNC_STATE.READY);
  assert.equal(result.committedOffset, 10);
  assert.equal(result.advanced, true);
});

test('archive health derives failed file count from ingest errors and clears it after a successful commit', () => {
  const db = new DatabaseSync(':memory:');
  const repository = new ArchiveRepository(db, { now: () => 1000 }).initialize();
  const health = new ArchiveHealthStore(repository, { now: () => 1000 });
  const source = { filePath: '/archive/fail.jsonl', fileIdentity: 'fail:1', size: 10, mtimeMs: 900 };
  try {
    health.recordIngestError({ sourcePath: source.filePath, source, error: new Error('fixture failure') });
    assert.equal(health.getHealth().failedFileCount, 1);

    repository.commitChunk({
      source,
      sessionId: 'thread-recovered',
      events: [{ kind: 'session-meta', atMs: 800, cwd: '/project', sourceOffset: 0 }],
      commitOffset: 10
    });
    assert.equal(health.getHealth().failedFileCount, 0);
  } finally {
    db.close();
  }
});

test('Archive Config health reports ATTENTION when failed ingest exists even with zero pending bytes', () => {
  const db = new DatabaseSync(':memory:');
  const repository = new ArchiveRepository(db, { now: () => 1000 }).initialize();
  const health = new ArchiveHealthStore(repository, { now: () => 1000 });
  try {
    health.recordIngestError({
      sourcePath: '/archive/failed.jsonl',
      source: { filePath: '/archive/failed.jsonl', fileIdentity: 'failed:1', size: 0, mtimeMs: 1 },
      error: new Error('failed')
    });
    const result = readArchiveConfigHealth({
      openDatabase: () => ({ repository, close() {} }),
      databasePath: () => '/archive/archive.sqlite3',
      readServiceStatus: () => ({ running: false, owner: null }),
      inspectHooks: () => ({ installed: true, complete: true }),
      fileSize: () => 123,
      now: () => 2000
    });
    assert.equal(result.failedFiles, 1);
    assert.equal(result.pendingFiles, 0);
    assert.equal(result.pendingBytes, 0);
    assert.equal(result.syncLabel, 'ATTENTION');
  } finally {
    db.close();
  }
});

test('coordinator prioritizes indexed append delta before historical UNINDEXED backfill', async () => {
  const historical = { filePath: '/archive/old-huge.jsonl', fileIdentity: 'old', size: 1_000_000, mtimeMs: 10 };
  const live = { filePath: '/archive/live-small.jsonl', fileIdentity: 'live', size: 1100, mtimeMs: 20 };
  const liveIngest = {
    sessionId: 'thread-live',
    sourcePath: live.filePath,
    fileIdentity: live.fileIdentity,
    committedOffset: 1000,
    observedFileSize: 1000,
    sourceMtime: 19,
    parserVersion: ARCHIVE_PARSER_VERSION,
    lastSuccessAt: 19,
    lastError: null
  };
  const repository = {
    getIngestState(filePath) { return filePath === live.filePath ? liveIngest : null; }
  };
  const calls = [];
  const coordinator = new ArchiveReconcileCoordinator({
    sessionsPath: '/archive',
    repository,
    healthStore: fakeHealthStore(),
    scanSources: async () => [historical, live],
    maxSourcesPerCycle: 1,
    yieldControl: async () => {},
    reconcileSource: async ({ filePath }) => {
      calls.push(filePath);
      return { state: ARCHIVE_SYNC_STATE.READY, bytesRead: 100, committedOffset: 1100, observedFileSize: 1100 };
    }
  });

  await coordinator.runCycle();
  assert.deepEqual(calls, [live.filePath]);
});
