import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveReconcileCoordinator } from '../../src/archive/coordinator.js';
import { openArchiveDatabase } from '../../src/archive/database.js';
import { readManagerArchiveDetail, canUseManagerArchiveDetail } from '../../src/manager/archive-detail.js';
import { ManagerArchiveVerifiedIndex } from '../../src/manager/archive-verified-index.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-verified-detail-'));
}

function archiveConfig() {
  return { archive: { enabled: true } };
}

test('incomplete Manager source scan cannot claim READY or invent ARCHIVED raw loss', async () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  const sourcePath = path.join(root, 'session.jsonl');
  const nowMs = 2_100_000_000_000;
  let seed = null;
  let index = null;
  try {
    seed = openArchiveDatabase({ dataDir, now: () => nowMs });
    seed.repository.commitChunk({
      source: { filePath: sourcePath, fileIdentity: 'fixture:verified:1', size: 100, mtimeMs: nowMs - 1000 },
      sessionId: 'thread-verified-scan',
      events: [{ kind: 'session-meta', atMs: nowMs - 5000, cwd: path.join(root, 'project'), model: 'gpt-test', sourceOffset: 1 }],
      commitOffset: 100
    });
    seed.close();
    seed = null;

    index = new ManagerArchiveVerifiedIndex({
      config: archiveConfig(),
      sessionsPath: root,
      openDatabase: () => openArchiveDatabase({ dataDir, now: () => nowMs }),
      scanSourcesWithHealth: async () => ({
        sources: [],
        complete: false,
        limited: false,
        errors: [{ path: root, operation: 'readdir', code: 'EACCES', error: 'permission denied' }]
      })
    });

    index.open();
    const snapshot = await index.refresh();
    assert.equal(snapshot.sourceScanComplete, false);
    assert.equal(snapshot.globalSyncState, 'CATCHING_UP');
    assert.equal(snapshot.sourceScanErrors.length, 1);
    assert.match(snapshot.error, /source scan error/);
    assert.equal(snapshot.rows.length, 1);
    assert.equal(snapshot.rows[0].threadId, 'thread-verified-scan');
    assert.equal(snapshot.rows[0].rawSourceExists, true);
    assert.equal(snapshot.rows[0].state, 'ENDED');
    assert.equal(snapshot.rows[0].archiveSyncState, 'CATCHING_UP');
    assert.equal(snapshot.rows[0].archiveVerified, false);
  } finally {
    try { index?.close(); } catch {}
    try { seed?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('incomplete service source scan never advances last successful reconcile', async () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  let opened = null;
  try {
    opened = openArchiveDatabase({ dataDir, now: () => 2_200_000_000_000 });
    const coordinator = new ArchiveReconcileCoordinator({
      sessionsPath: root,
      repository: opened.repository,
      scanSources: async () => ({
        sources: [],
        complete: false,
        limited: false,
        errors: [{ path: root, operation: 'readdir', code: 'EACCES', error: 'permission denied' }]
      }),
      yieldControl: async () => {}
    });

    const before = coordinator.health.getHealth();
    assert.equal(before.lastSuccessfulReconcile, null);
    const result = await coordinator.runCycle();
    assert.equal(result.sourceScanComplete, false);
    assert.equal(result.sourceScanErrors.length, 1);
    assert.equal(result.health.reconcileGeneration, 1);
    assert.equal(result.health.lastSuccessfulReconcile, null);
  } finally {
    try { opened?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('READY Manager archive detail is read from normalized SQLite tables without raw HistoryEngine', () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  const sourcePath = path.join(root, 'session.jsonl');
  const base = 2_300_000_000_000;
  let opened = null;
  try {
    opened = openArchiveDatabase({ dataDir, now: () => base + 10_000 });
    opened.repository.commitChunk({
      source: { filePath: sourcePath, fileIdentity: 'fixture:detail:1', size: 500, mtimeMs: base + 9000 },
      sessionId: 'thread-sqlite-detail',
      events: [
        { kind: 'session-meta', atMs: base, cwd: path.join(root, 'project-detail'), model: 'gpt-detail', reasoning: 'high', sourceOffset: 1 },
        { kind: 'turn-start', atMs: base + 1000, turnId: 'turn-1', sourceOffset: 20 },
        { kind: 'usage', atMs: base + 2000, inputTokens: 120, cachedInputTokens: 30, outputTokens: 40, reasoningTokens: 8, turnInputTokens: 120, turnOutputTokens: 40, contextUsed: 300, contextWindow: 1000, sourceOffset: 80 },
        { kind: 'tool-start', atMs: base + 3000, rawType: 'function_call', tool: 'exec', callId: 'call-1', sourceOffset: 140 },
        { kind: 'tool-end', atMs: base + 3500, rawType: 'function_call_output', callId: 'call-1', status: 'COMPLETED', durationMs: 500, sourceOffset: 180 },
        { kind: 'compaction', atMs: base + 4000, sourceOffset: 220 },
        { kind: 'error', atMs: base + 4500, detail: 'fixture-error', sourceOffset: 260 },
        { kind: 'turn-complete', atMs: base + 6000, turnId: 'turn-1', sourceOffset: 320 }
      ],
      commitOffset: 500
    });

    const archiveIndex = { opened };
    const row = {
      id: sourcePath,
      filePath: sourcePath,
      fileSizeBytes: 500,
      state: 'ENDED',
      threadId: 'thread-sqlite-detail',
      project: 'project-detail',
      archiveBacked: true,
      archiveSyncState: 'READY'
    };
    assert.equal(canUseManagerArchiveDetail(row), true);
    const detail = readManagerArchiveDetail(archiveIndex, row);
    assert.ok(detail);
    assert.equal(detail.source, 'archive-sqlite');
    assert.equal(detail.archiveSchemaVersion, 2);
    assert.equal(detail.info.threadId, 'thread-sqlite-detail');
    assert.equal(detail.info.model, 'gpt-detail');
    assert.equal(detail.info.reasoning, 'high');
    assert.equal(detail.tokens.input, 120);
    assert.equal(detail.tokens.cached, 30);
    assert.equal(detail.tokens.output, 40);
    assert.equal(detail.tokens.contextUsed, 300);
    assert.equal(detail.tokens.contextWindow, 1000);
    assert.equal(detail.turns.count, 1);
    assert.equal(detail.turns.completed, 1);
    assert.equal(detail.analytics.turns.items.length, 1);
    assert.equal(detail.analytics.turns.items[0].durationMs, 5000);
    assert.equal(detail.analytics.turns.items[0].cachedTokens, 30);
    assert.equal(detail.analytics.turns.items[0].reasoningTokens, 8);
    assert.equal(detail.analytics.turns.items[0].tokenCoverage, 'indexed');
    assert.equal(detail.analytics.tokens.points.length, 1);
    assert.equal(detail.analytics.tokens.points[0].total, 160);
    assert.equal(detail.analytics.tokens.coverage, 'indexed');
    assert.equal(detail.analytics.tools.total, 1);
    assert.equal(detail.analytics.tools.byName[0].name, 'exec');
    assert.equal(detail.analytics.tools.byType[0].name, 'shell');
    assert.equal(detail.analytics.tools.events[0].group, 'shell');
    assert.equal(detail.analytics.tools.events[0].durationMs, 500);
    assert.equal(detail.analytics.context.points.length, 1);
    assert.equal(detail.analytics.context.compactions.length, 1);
    assert.ok(detail.analytics.signals.some((item) => item.kind === 'error'));
    assert.ok(detail.timeline.some((item) => item.tool === 'exec' && item.group === 'shell'));
    assert.ok(detail.errors.some((item) => /fixture-error/.test(item.detail)));

    assert.equal(canUseManagerArchiveDetail({ ...row, state: 'LIVE' }), false);
    assert.equal(canUseManagerArchiveDetail({ ...row, archiveSyncState: 'CATCHING_UP' }), false);
    assert.equal(canUseManagerArchiveDetail({ ...row, archiveSyncState: 'UNINDEXED' }), false);
    assert.equal(canUseManagerArchiveDetail({ ...row, archiveSyncState: 'STALE' }), false);
    assert.equal(canUseManagerArchiveDetail({ ...row, state: 'ARCHIVED', archiveSyncState: 'ARCHIVED' }), true);
  } finally {
    try { opened?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});
