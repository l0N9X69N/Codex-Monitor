import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openArchiveDatabase } from '../../src/archive/database.js';
import { ManagerArchiveIndex, mergeManagerArchiveRows } from '../../src/manager/archive-index.js';
import { SessionManagerCore } from '../../src/manager/session-core.js';
import { SessionManagerTracker } from '../../src/manager/tracker.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-manager-archive-'));
}

function archiveConfig(enabled = true) {
  return { archive: { enabled } };
}

test('Manager archive index reads SQLite first then verifies source metadata into READY', async () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  const sourcePath = path.join(root, 'session.jsonl');
  const nowMs = 1_900_000_000_000;
  let seed = null;
  let index = null;
  try {
    seed = openArchiveDatabase({ dataDir, now: () => nowMs });
    seed.repository.commitChunk({
      source: { filePath: sourcePath, fileIdentity: 'fixture:1', size: 120, mtimeMs: nowMs - 1000 },
      sessionId: 'thread-sqlite-first',
      events: [
        { kind: 'session-meta', atMs: nowMs - 10_000, cwd: path.join(root, 'project-a'), model: 'gpt-test', reasoning: 'medium', sourceOffset: 1 },
        { kind: 'usage', atMs: nowMs - 5000, inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, reasoningTokens: 10, contextUsed: 400, contextWindow: 1000, sourceOffset: 50 }
      ],
      commitOffset: 120
    });
    seed.close();
    seed = null;

    let scans = 0;
    index = new ManagerArchiveIndex({
      config: archiveConfig(true),
      sessionsPath: root,
      openDatabase: () => openArchiveDatabase({ dataDir, now: () => nowMs }),
      scanSources: async () => {
        scans += 1;
        return [{ filePath: sourcePath, fileIdentity: 'fixture:1', size: 120, mtimeMs: nowMs - 1000 }];
      }
    });

    const first = index.open();
    assert.equal(scans, 0);
    assert.equal(first.available, true);
    assert.equal(first.sourceScanComplete, false);
    assert.equal(first.rows.length, 1);
    assert.equal(first.rows[0].threadId, 'thread-sqlite-first');
    assert.equal(first.rows[0].project, 'project-a');
    assert.equal(first.rows[0].tokens.input, 100);

    const verified = await index.refresh();
    assert.equal(scans, 1);
    assert.equal(verified.sourceScanComplete, true);
    assert.equal(verified.globalSyncState, 'READY');
    assert.equal(verified.rows[0].archiveSyncState, 'READY');
    assert.equal(verified.rows[0].archiveVerified, true);
    assert.equal(verified.rows[0].filePath, sourcePath);
  } finally {
    try { index?.close(); } catch {}
    try { seed?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Manager archive index exposes UNINDEXED source and ARCHIVED analytics honestly', async () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  const archivedSource = path.join(root, 'gone.jsonl');
  const newSource = path.join(root, 'new.jsonl');
  let seed = null;
  let index = null;
  try {
    seed = openArchiveDatabase({ dataDir, now: () => 2_000_000_000_000 });
    seed.repository.commitChunk({
      source: { filePath: archivedSource, fileIdentity: 'gone:1', size: 10, mtimeMs: 1_999_999_999_000 },
      sessionId: 'thread-archived',
      events: [{ kind: 'session-meta', atMs: 1_999_999_990_000, cwd: path.join(root, 'old-project'), model: 'gpt-old', sourceOffset: 1 }],
      commitOffset: 10
    });
    seed.close();
    seed = null;

    index = new ManagerArchiveIndex({
      config: archiveConfig(true),
      sessionsPath: root,
      openDatabase: () => openArchiveDatabase({ dataDir }),
      scanSources: async () => [{ filePath: newSource, fileIdentity: 'new:1', size: 2 * 1024 * 1024 * 1024, mtimeMs: 2_000_000_000_000 }]
    });

    index.open();
    const snapshot = await index.refresh();
    const archived = snapshot.rows.find((row) => row.threadId === 'thread-archived');
    const unindexed = snapshot.rows.find((row) => row.filePath === newSource);
    assert.equal(archived.state, 'ARCHIVED');
    assert.equal(archived.archiveSyncState, 'ARCHIVED');
    assert.equal(archived.rawSourceExists, false);
    assert.equal(unindexed.archiveSyncState, 'UNINDEXED');
    assert.equal(unindexed.project, 'UNKNOWN');
    assert.equal(unindexed.fileSizeBytes, 2 * 1024 * 1024 * 1024);
    assert.equal(unindexed.countsComplete, false);
    assert.equal(snapshot.globalSyncState, 'UNINDEXED');
  } finally {
    try { index?.close(); } catch {}
    try { seed?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('raw Manager rows overlay SQLite base without dropping archive-only history', () => {
  const sourcePath = path.resolve('/tmp/live.jsonl');
  const archiveRows = [
    {
      id: sourcePath,
      filePath: sourcePath,
      sourcePath,
      state: 'ENDED',
      threadId: 'thread-live',
      project: 'archive-project',
      model: 'gpt-base',
      tokens: { input: 100, cached: 20, output: 30, reasoning: 10, contextWindow: null, contextUsed: 400 },
      turnCount: 5,
      toolCount: 4,
      countsComplete: true,
      lastActivityAtMs: 1000,
      fileSizeBytes: 100,
      rawSourceExists: true,
      archiveBacked: true,
      archiveSyncState: 'CATCHING_UP'
    },
    {
      id: 'archive:old',
      filePath: null,
      sourcePath: '/tmp/old.jsonl',
      state: 'ARCHIVED',
      threadId: 'old',
      project: 'old-project',
      tokens: { input: 50 },
      rawSourceExists: false,
      archiveBacked: true,
      archiveSyncState: 'ARCHIVED',
      lastActivityAtMs: 500
    }
  ];
  const rawRows = [{
    id: sourcePath,
    filePath: sourcePath,
    state: 'LIVE',
    threadId: 'thread-live',
    project: 'live-project',
    model: 'gpt-live',
    tokens: { input: 120, cached: null, output: null, reasoning: null, contextWindow: 1000, contextUsed: 450 },
    turnCount: null,
    toolCount: null,
    countsComplete: false,
    observedTurnCount: 1,
    observedToolCount: 2,
    lastActivityAtMs: 2000,
    fileSizeBytes: 140,
    modifiedAtMs: 2000
  }];

  const merged = mergeManagerArchiveRows(rawRows, archiveRows);
  assert.equal(merged.length, 2);
  const live = merged.find((row) => row.threadId === 'thread-live');
  assert.equal(live.state, 'LIVE');
  assert.equal(live.project, 'live-project');
  assert.equal(live.model, 'gpt-live');
  assert.equal(live.tokens.input, 120);
  assert.equal(live.tokens.cached, 20);
  assert.equal(live.tokens.contextWindow, 1000);
  assert.equal(live.turnCount, 5);
  assert.equal(live.toolCount, 4);
  assert.equal(live.archiveSyncState, 'CATCHING_UP');
  assert.equal(merged.some((row) => row.state === 'ARCHIVED'), true);
});

test('tracker first tick renders SQLite rows without raw discovery', async () => {
  const core = new SessionManagerCore({ sessionsPath: path.resolve('/missing-manager-sessions') });
  let opens = 0;
  let refreshes = 0;
  let discovers = 0;
  const originalDiscover = core.discover.bind(core);
  core.discover = (...args) => { discovers += 1; return originalDiscover(...args); };
  const archiveRow = {
    id: 'archive:thread-fast',
    state: 'ARCHIVED',
    threadId: 'thread-fast',
    project: 'fast-history',
    tokens: {},
    rawSourceExists: false,
    archiveBacked: true,
    archiveSyncState: 'ARCHIVED'
  };
  const archiveIndex = {
    enabled: true,
    lastSnapshot: null,
    open() {
      opens += 1;
      return { enabled: true, available: true, sourceScanComplete: false, globalSyncState: 'CATCHING_UP', rows: [archiveRow], pendingFileCount: 0, pendingByteCount: 0, error: null };
    },
    async refresh() {
      refreshes += 1;
      return { enabled: true, available: true, sourceScanComplete: true, globalSyncState: 'READY', rows: [archiveRow], pendingFileCount: 0, pendingByteCount: 0, error: null };
    }
  };
  const tracker = new SessionManagerTracker({ core, platformAdapter: null, archiveIndex, now: () => 1234 });

  const first = await tracker.tick();
  assert.equal(opens, 1);
  assert.equal(refreshes, 0);
  assert.equal(discovers, 0);
  assert.equal(first.rows.length, 1);
  assert.equal(first.rows[0].project, 'fast-history');
  assert.equal(first.archiveSourceScanComplete, false);

  const second = await tracker.tick();
  assert.equal(refreshes, 1);
  assert.equal(discovers, 1);
  assert.equal(second.archiveSourceScanComplete, true);
  assert.equal(second.archiveSyncState, 'READY');
});
