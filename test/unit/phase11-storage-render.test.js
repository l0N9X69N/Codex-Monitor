import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionStorageSummary, summarizeSelectedSessions } from '../../src/manager/storage-summary.js';
import { renderClearConfirmation, renderStorageManager } from '../../src/manager/storage-render.js';
import { MANAGER_DELETE_SCOPE } from '../../src/manager/storage-delete.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

const rows = [
  { id: 'ended-a', filePath: '/sessions/ended-a.jsonl', threadId: 'thread-ended-a', state: 'ENDED', project: 'alpha', fileSizeBytes: 4 * 1024 * 1024, lastActivityAtMs: 1_700_000_000_000 },
  { id: 'ended-b', filePath: '/sessions/ended-b.jsonl', threadId: 'thread-ended-b', state: 'ENDED', project: 'beta', fileSizeBytes: 2 * 1024 * 1024, lastActivityAtMs: 1_700_000_100_000 },
  { id: 'live-c', filePath: '/sessions/live-c.jsonl', threadId: 'thread-live-c', state: 'LIVE', project: 'alpha', fileSizeBytes: 1024 * 1024, lastActivityAtMs: 1_700_000_200_000 }
];

test('storage surface shows RAW delete mode, cursor, selected size and protected sessions without overflow', () => {
  const selectedIds = new Set(['ended-a']);
  const summary = buildSessionStorageSummary(rows, { nowMs: 1_700_000_300_000 });
  const selectedSummary = summarizeSelectedSessions(rows, selectedIds);
  const frame = renderStorageManager({ summary, selectedSummary, selectedIds, rows, cursorIndex: 1, width: 120, height: 32, mode: 'mono' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.match(text, /STORAGE MANAGER/);
  assert.match(text, /MODE RAW/);
  assert.match(text, /7\.0M/);
  assert.match(text, /Selected\s+1 sessions\s+4\.0M/);
  assert.match(text, /\[x\].*alpha/);
  assert.match(text, /\[-\].*alpha.*LIVE/);
  assert.match(text, /SESSIONS 2\/3/);
  assert.match(text, /▸ \[ \].*beta/);
  assert.match(text, /BY PROJECT/);
  assert.match(text, /BY AGE/);
  assert.match(stripAnsi(frame.lines.at(-1)), /↑↓ move.*Space toggle.*D delete-mode.*C delete.*M\/Q back/);
  assert.ok(frame.lines.length <= 32);
  assert.ok(frame.lines.every((line) => cellWidth(line) <= 120));
});

test('storage session viewport follows cursor through a list longer than the panel', () => {
  const many = Array.from({ length: 40 }, (_, index) => ({
    id: `ended-${index}`,
    filePath: `/sessions/ended-${index}.jsonl`,
    threadId: `thread-${String(index).padStart(3, '0')}`,
    state: 'ENDED',
    project: `project-${index}`,
    fileSizeBytes: (40 - index) * 1024,
    lastActivityAtMs: 1_700_000_000_000 + index
  }));
  const summary = buildSessionStorageSummary(many, { nowMs: 1_700_000_300_000 });
  const frame = renderStorageManager({ summary, selectedSummary: summarizeSelectedSessions(many, []), selectedIds: new Set(), rows: many, cursorIndex: 30, width: 120, height: 24, mode: 'mono' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.match(text, /SESSIONS 31\/40/);
  assert.match(text, /▸ \[ \].*project-30/);
  assert.ok(frame.lines.every((line) => cellWidth(line) <= 120));
});

test('ARCHIVE mode exposes archive-only rows while RAW mode protects them', () => {
  const archiveOnly = { id: 'archive:old', filePath: null, sourcePath: '/sessions/old.jsonl', threadId: 'old', state: 'ARCHIVED', project: 'old-project', archiveBacked: true, rawSourceExists: false };
  const sourceRows = [archiveOnly, ...rows];
  const summary = buildSessionStorageSummary(sourceRows, { nowMs: 1_700_000_300_000 });
  const raw = stripAnsi(renderStorageManager({ summary, selectedSummary: summarizeSelectedSessions(sourceRows, []), rows: sourceRows, deleteScope: MANAGER_DELETE_SCOPE.RAW, width: 120, height: 26, mode: 'mono' }).lines.join('\n'));
  const archived = stripAnsi(renderStorageManager({ summary, selectedSummary: summarizeSelectedSessions(sourceRows, []), rows: sourceRows, deleteScope: MANAGER_DELETE_SCOPE.ARCHIVE, width: 120, height: 26, mode: 'mono' }).lines.join('\n'));
  assert.match(raw, /\[-\].*old-project.*ARCHIVED.*SQL/);
  assert.match(archived, /\[ \].*old-project.*ARCHIVED.*SQL/);
});

test('delete confirmation is explicit about EVERYTHING ordering and bounded', () => {
  const selectedIds = new Set(['ended-a', 'ended-b']);
  const selectedSummary = summarizeSelectedSessions(rows, selectedIds);
  const frame = renderClearConfirmation({ rows, selectedIds, selectedSummary, deleteScope: MANAGER_DELETE_SCOPE.EVERYTHING, width: 100, height: 24, mode: 'mono' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.match(text, /DELETE EVERYTHING · 2 SESSIONS · 6\.0M raw\?/);
  assert.match(text, /Delete raw Codex JSONL first, then archived analytics/);
  assert.match(text, /Y.*confirm delete/);
  assert.match(text, /N \/ Esc.*cancel/);
  assert.match(text, /full delete preserves archive if raw deletion fails/);
  assert.ok(frame.lines.every((line) => cellWidth(line) <= 100));
});
