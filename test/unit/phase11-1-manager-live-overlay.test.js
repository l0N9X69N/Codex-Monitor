import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCommittedJsonlChunk } from '../../src/archive/source-reader.js';
import {
  applyManagerArchiveOverlay,
  ManagerArchiveLiveOverlay,
  managerArchiveOverlayPathKey
} from '../../src/manager/archive-live-overlay.js';
import { mergeManagerArchiveRows } from '../../src/manager/archive-row-merge.js';
import { SessionManagerCore } from '../../src/manager/session-core.js';
import { SessionManagerTracker } from '../../src/manager/tracker.js';

function tempFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-overlay-'));
  return { root, filePath: path.join(root, 'session.jsonl') };
}

function jsonl(lines) {
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}

const meta = {
  timestamp: '2026-08-27T06:00:00.000Z',
  type: 'session_meta',
  payload: { id: 'overlay-thread', cwd: 'C:/repo/overlay', model: 'gpt-base' }
};

function archiveRow(filePath, committedOffset, fileSize, overrides = {}) {
  return {
    id: filePath,
    filePath,
    sourcePath: filePath,
    state: 'LIVE',
    threadId: 'overlay-thread',
    project: 'overlay',
    cwd: 'C:/repo/overlay',
    model: 'gpt-base',
    reasoning: 'medium',
    startedAtMs: Date.parse('2026-08-27T06:00:00.000Z'),
    tokens: { input: 100, cached: 20, output: 30, reasoning: 10, contextWindow: 1000, contextUsed: 400 },
    turnCount: 5,
    toolCount: 4,
    errorCount: 1,
    retryCount: 0,
    compactionCount: 0,
    countsComplete: true,
    observedTurnCount: 5,
    observedToolCount: 4,
    observedAgentSpawnCount: 0,
    lastActivityAtMs: Date.parse('2026-08-27T06:00:00.000Z'),
    recentErrors: [],
    recentRetries: [],
    recentCompactions: [],
    fileSizeBytes: fileSize,
    modifiedAtMs: Date.parse('2026-08-27T06:00:00.000Z'),
    rawSourceExists: true,
    archiveBacked: true,
    archiveVerified: true,
    archiveSyncState: 'CATCHING_UP',
    archiveCommittedOffset: committedOffset,
    archiveObservedFileSize: fileSize,
    archiveParserVersion: 1,
    archiveLastSuccessAt: 1,
    archiveLastError: null,
    ...overrides
  };
}

function rawRow(filePath, fileSize, overrides = {}) {
  return {
    id: filePath,
    filePath,
    name: 'session',
    state: 'LIVE',
    threadId: 'overlay-thread',
    project: 'overlay',
    model: 'raw-must-not-win',
    reasoning: null,
    startedAtMs: Date.parse('2026-08-27T06:00:00.000Z'),
    tokens: { input: 999, cached: 999, output: 999, reasoning: 999, contextWindow: 999, contextUsed: 999 },
    turnCount: 99,
    toolCount: 99,
    countsComplete: true,
    observedTurnCount: 99,
    observedToolCount: 99,
    lastActivityAtMs: Date.parse('2026-08-27T06:00:10.000Z'),
    fileSizeBytes: fileSize,
    modifiedAtMs: Date.parse('2026-08-27T06:00:10.000Z'),
    recentErrors: [{ atMs: 1, detail: 'raw duplicate' }],
    recentRetries: [],
    recentCompactions: [],
    ...overrides
  };
}

test('Manager live overlay starts exactly at SQLite committed offset and does not double-count raw summary totals', async () => {
  const { root, filePath } = tempFixture();
  let reads = 0;
  try {
    const committed = jsonl([meta]);
    const delta = jsonl([
      { timestamp: '2026-08-27T06:00:01.000Z', type: 'turn_started', payload: { turn_id: 't6' } },
      {
        timestamp: '2026-08-27T06:00:02.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 120, cached_input_tokens: 25, output_tokens: 40, reasoning_output_tokens: 12 },
            last_token_usage: { input_tokens: 20, output_tokens: 10, total_tokens: 450 },
            model_context_window: 1000
          }
        }
      },
      { timestamp: '2026-08-27T06:00:03.000Z', type: 'exec_command_begin', payload: { call_id: 'c6', name: 'exec' } },
      { timestamp: '2026-08-27T06:00:04.000Z', type: 'error', payload: { message: 'delta-error' } },
      { timestamp: '2026-08-27T06:00:05.000Z', type: 'turn_complete', payload: { turn_id: 't6' } }
    ]);
    fs.writeFileSync(filePath, committed + delta);
    const committedOffset = Buffer.byteLength(committed);
    const fileSize = fs.statSync(filePath).size;
    const archived = archiveRow(filePath, committedOffset, fileSize);
    const raw = rawRow(filePath, fileSize);
    const overlay = new ManagerArchiveLiveOverlay({
      async readChunk(...args) {
        reads += 1;
        return readCommittedJsonlChunk(...args);
      }
    });

    const first = await overlay.update([raw], [archived]);
    const state = first.overlays.get(managerArchiveOverlayPathKey(filePath));
    assert.equal(state.baseOffset, committedOffset);
    assert.equal(state.parsedOffset, fileSize);
    assert.equal(state.caughtUp, true);
    assert.equal(state.tokens.input, 120);
    assert.equal(state.tokens.cached, 25);
    assert.equal(state.tokens.output, 40);
    assert.equal(state.tokens.reasoning, 12);
    assert.equal(state.tokens.contextUsed, 450);
    assert.equal(state.turnCount, 6);
    assert.equal(state.toolCount, 5);
    assert.equal(state.errorCount, 2);
    assert.equal(state.recentErrors.at(-1).detail, 'delta-error');

    const archiveWithDelta = applyManagerArchiveOverlay(archived, state);
    const [merged] = mergeManagerArchiveRows([raw], [archiveWithDelta]);
    assert.equal(merged.state, 'LIVE');
    assert.equal(merged.model, 'gpt-base');
    assert.equal(merged.tokens.input, 120, 'raw whole-file summary must not overwrite SQLite+delta tokens');
    assert.equal(merged.turnCount, 6, 'raw whole-file summary must not double-count turns');
    assert.equal(merged.toolCount, 5, 'raw whole-file summary must not double-count tools');
    assert.equal(merged.errorCount, 2);
    assert.equal(merged.lastActivitySource, 'archive+jsonl-delta');
    assert.equal(merged.recentErrors.some((entry) => entry.detail === 'raw duplicate'), false);

    const readsAfterFirst = reads;
    await overlay.update([raw], [archived]);
    assert.equal(reads, readsAfterFirst, 'caught-up overlay must not reread the same delta bytes');

    const committedArchive = archiveRow(filePath, fileSize, fileSize, {
      tokens: { input: 120, cached: 25, output: 40, reasoning: 12, contextWindow: null, contextUsed: 450 },
      turnCount: 6,
      toolCount: 5,
      errorCount: 2,
      archiveSyncState: 'READY',
      archiveLastSuccessAt: 2
    });
    const rebased = await overlay.update([raw], [committedArchive]);
    const rebasedState = rebased.overlays.get(managerArchiveOverlayPathKey(filePath));
    assert.equal(rebasedState.baseOffset, fileSize);
    assert.equal(rebasedState.parsedOffset, fileSize);
    assert.equal(rebasedState.turnCount, 6);
    assert.equal(rebasedState.toolCount, 5);
    assert.equal(rebasedState.errorCount, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('raw growth downgrades a cached READY archive row before the next metadata scan', () => {
  const filePath = path.resolve('/tmp/overlay-ready.jsonl');
  const archived = archiveRow(filePath, 100, 100, {
    archiveSyncState: 'READY',
    archiveVerified: true,
    fileSizeBytes: 100
  });
  const raw = rawRow(filePath, 140);
  const [merged] = mergeManagerArchiveRows([raw], [archived]);
  assert.equal(merged.archiveSyncState, 'CATCHING_UP');
  assert.equal(merged.archiveVerified, false);
  assert.equal(merged.fileSizeBytes, 140);
});

test('tracker rate-limits SQLite metadata refresh separately from the 250ms runtime cadence', async () => {
  const core = new SessionManagerCore({ sessionsPath: path.resolve('/missing-overlay-cadence') });
  let nowMs = 10_000;
  let refreshes = 0;
  let overlayUpdates = 0;
  const row = {
    id: 'archive:cadence',
    state: 'ARCHIVED',
    threadId: 'cadence',
    project: 'cadence',
    tokens: {},
    rawSourceExists: false,
    archiveBacked: true,
    archiveVerified: true,
    archiveSyncState: 'ARCHIVED'
  };
  const snapshot = () => ({
    enabled: true,
    available: true,
    sourceScanComplete: true,
    globalSyncState: 'READY',
    rows: [row],
    sourceCount: 0,
    pendingFileCount: 0,
    pendingByteCount: 0,
    health: null,
    error: null
  });
  const archiveIndex = {
    enabled: true,
    lastSnapshot: null,
    open: () => snapshot(),
    async refresh() { refreshes += 1; return snapshot(); }
  };
  const archiveLiveOverlay = {
    async update() { overlayUpdates += 1; return { overlays: new Map(), changed: false }; },
    reset() {}
  };
  const tracker = new SessionManagerTracker({
    core,
    platformAdapter: null,
    archiveIndex,
    archiveLiveOverlay,
    archiveRefreshIntervalMs: 2500,
    archiveOverlayIntervalMs: 500,
    now: () => nowMs
  });

  await tracker.tick();
  assert.equal(refreshes, 0, 'SQLite-first prime must render without metadata scan');

  await tracker.tick();
  assert.equal(refreshes, 1, 'second tick performs the first verification scan');
  assert.equal(overlayUpdates, 1);

  nowMs += 250;
  await tracker.tick();
  assert.equal(refreshes, 1, '250ms UI tick must not rescan archive metadata');
  assert.equal(overlayUpdates, 1, 'overlay has its own bounded cadence');

  nowMs += 250;
  await tracker.tick();
  assert.equal(refreshes, 1);
  assert.equal(overlayUpdates, 2);

  nowMs += 2000;
  await tracker.tick();
  assert.equal(refreshes, 2, 'archive metadata refresh resumes at its own interval');
  tracker.close();
});
