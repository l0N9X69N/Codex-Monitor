import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE_PARSER_VERSION, ARCHIVE_SYNC_STATE } from '../../src/archive/constants.js';
import { ArchiveReconcileCoordinator } from '../../src/archive/coordinator.js';
import { ArchiveHealthStore, needsArchiveSourceReconcile } from '../../src/archive/health-store.js';
import { reconcileArchiveSource } from '../../src/archive/reconcile.js';
import { ArchiveRepository } from '../../src/archive/repository.js';
import { scanArchiveSources } from '../../src/archive/source-scan.js';

function tempRoot(prefix = 'codexm-phase11-1-coordinator-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeHealthStore({ summarize = { pendingFileCount: 0, pendingByteCount: 0 } } = {}) {
  let generation = 0;
  const errors = [];
  return {
    errors,
    listTrackedRawSources() { return []; },
    beginGeneration() { generation += 1; return generation; },
    recordIngestError(value) { errors.push(value); },
    summarizePending() { return summarize; },
    finishGeneration({ generation: current, ...rest }) {
      return { applied: current === generation, health: { reconcileGeneration: generation, ...rest } };
    }
  };
}

test('lightweight source scan finds nested JSONL only and returns metadata', async () => {
  const root = tempRoot();
  try {
    const nested = path.join(root, '2026', '08');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, 'a.jsonl'), '{}\n');
    fs.writeFileSync(path.join(nested, 'b.JSONL'), '{}\n{}\n');
    fs.writeFileSync(path.join(nested, 'ignore.txt'), 'x');

    const sources = await scanArchiveSources(root);
    assert.equal(sources.length, 2);
    assert.ok(sources.every((item) => item.filePath.toLowerCase().endsWith('.jsonl')));
    assert.ok(sources.every((item) => Number.isFinite(item.size) && Number.isFinite(item.mtimeMs)));
    assert.ok(sources.every((item) => typeof item.fileIdentity === 'string' && item.fileIdentity.length > 0));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('archive health store tracks generations, pending work and ingest errors without moving checkpoint', () => {
  const db = new DatabaseSync(':memory:');
  const repository = new ArchiveRepository(db, { now: () => 100 }).initialize();
  const health = new ArchiveHealthStore(repository, { now: () => 200 });
  try {
    const source = { filePath: '/tmp/a.jsonl', fileIdentity: '1:2:3', size: 500, mtimeMs: 150 };
    assert.equal(needsArchiveSourceReconcile(source, null), true);
    const generation = health.beginGeneration({ sourceCount: 1, nowMs: 150 });
    assert.equal(generation, 1);

    const errored = health.recordIngestError({ sourcePath: source.filePath, source, error: new Error('boom') });
    assert.equal(errored.committedOffset, 0);
    assert.equal(errored.lastError, 'boom');

    const pending = health.summarizePending([source]);
    assert.deepEqual(pending, { pendingFileCount: 1, pendingByteCount: 500 });
    const failed = health.finishGeneration({ generation, ...pending, success: false, nowMs: 175 });
    assert.equal(failed.health.lastSuccessfulReconcile, null);
    assert.equal(failed.health.pendingFileCount, 1);

    const nextGeneration = health.beginGeneration({ sourceCount: 1, nowMs: 180 });
    const finished = health.finishGeneration({ generation: nextGeneration, pendingFileCount: 0, pendingByteCount: 0, success: true, nowMs: 200 });
    assert.equal(finished.health.reconcileGeneration, 2);
    assert.equal(finished.health.lastSuccessfulReconcile, 200);
  } finally {
    db.close();
  }
});

test('bounded coordinator rotates a catching-up source behind later sources', async () => {
  const a = { filePath: '/archive/a.jsonl', fileIdentity: 'a', size: 1000, mtimeMs: 10 };
  const b = { filePath: '/archive/b.jsonl', fileIdentity: 'b', size: 100, mtimeMs: 9 };
  const states = new Map();
  const calls = [];
  const repository = { getIngestState(filePath) { return states.get(filePath) ?? null; } };
  const health = fakeHealthStore({ summarize: { pendingFileCount: 1, pendingByteCount: 500 } });

  const coordinator = new ArchiveReconcileCoordinator({
    sessionsPath: '/archive',
    repository,
    healthStore: health,
    scanSources: async () => [a, b],
    yieldControl: async () => {},
    maxSourcesPerCycle: 1,
    maxBytesPerSource: 256,
    reconcileSource: async ({ filePath, maxBytes }) => {
      calls.push(filePath);
      const source = filePath === a.filePath ? a : b;
      if (filePath === a.filePath) {
        states.set(filePath, {
          sourcePath: filePath,
          fileIdentity: source.fileIdentity,
          committedOffset: 256,
          observedFileSize: source.size,
          sourceMtime: source.mtimeMs,
          parserVersion: ARCHIVE_PARSER_VERSION,
          lastError: null
        });
        return { state: ARCHIVE_SYNC_STATE.CATCHING_UP, bytesRead: maxBytes, committedOffset: 256, observedFileSize: source.size };
      }
      states.set(filePath, {
        sourcePath: filePath,
        fileIdentity: source.fileIdentity,
        committedOffset: source.size,
        observedFileSize: source.size,
        sourceMtime: source.mtimeMs,
        parserVersion: ARCHIVE_PARSER_VERSION,
        lastError: null
      });
      return { state: ARCHIVE_SYNC_STATE.READY, bytesRead: source.size, committedOffset: source.size, observedFileSize: source.size };
    }
  });

  const first = await coordinator.runCycle();
  assert.deepEqual(calls, [a.filePath]);
  assert.equal(first.queueDepth, 2);

  const second = await coordinator.runCycle();
  assert.deepEqual(calls, [a.filePath, b.filePath]);
  assert.equal(second.queueDepth, 1);
});

test('one source failure is recorded and does not stop later sources in the same cycle', async () => {
  const bad = { filePath: '/archive/bad.jsonl', fileIdentity: 'bad', size: 10, mtimeMs: 1 };
  const good = { filePath: '/archive/good.jsonl', fileIdentity: 'good', size: 10, mtimeMs: 1 };
  const states = new Map();
  const calls = [];
  const repository = { getIngestState(filePath) { return states.get(filePath) ?? null; } };
  const health = fakeHealthStore();
  const coordinator = new ArchiveReconcileCoordinator({
    sessionsPath: '/archive',
    repository,
    healthStore: health,
    scanSources: async () => [bad, good],
    yieldControl: async () => {},
    maxSourcesPerCycle: 2,
    reconcileSource: async ({ filePath }) => {
      calls.push(filePath);
      if (filePath === bad.filePath) throw new Error('bad-source');
      states.set(filePath, {
        sourcePath: filePath,
        fileIdentity: good.fileIdentity,
        committedOffset: good.size,
        observedFileSize: good.size,
        sourceMtime: good.mtimeMs,
        parserVersion: ARCHIVE_PARSER_VERSION,
        lastError: null
      });
      return { state: ARCHIVE_SYNC_STATE.READY, bytesRead: 10 };
    }
  });

  const result = await coordinator.runCycle();
  assert.deepEqual(calls, [bad.filePath, good.filePath]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].error, 'bad-source');
  assert.equal(health.errors.length, 1);
});

test('same-size source modified after committed checkpoint is STALE instead of false READY', async () => {
  const repository = {
    getIngestState() {
      return {
        sessionId: 'thread-1',
        fileIdentity: 'same',
        committedOffset: 10,
        observedFileSize: 10,
        sourceMtime: 100,
        parserVersion: ARCHIVE_PARSER_VERSION,
        lastError: null
      };
    },
    markSourceMissing() { throw new Error('not expected'); }
  };

  const result = await reconcileArchiveSource({
    filePath: '/archive/replaced.jsonl',
    repository,
    inspectSource: async () => ({ exists: true, filePath: '/archive/replaced.jsonl', fileIdentity: 'same', size: 10, mtimeMs: 200 }),
    readChunk: async () => { throw new Error('reader must not run for stale source'); }
  });

  assert.equal(result.state, ARCHIVE_SYNC_STATE.STALE);
  assert.equal(result.reason, 'source-modified-at-checkpoint');
  assert.equal(result.committedOffset, 10);
});
