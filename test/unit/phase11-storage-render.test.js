import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionStorageSummary, summarizeSelectedSessions } from '../../src/manager/storage-summary.js';
import { renderClearConfirmation, renderStorageManager } from '../../src/manager/storage-render.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

const rows = [
  { id: 'ended-a', threadId: 'thread-ended-a', state: 'ENDED', project: 'alpha', fileSizeBytes: 4 * 1024 * 1024, lastActivityAtMs: 1_700_000_000_000 },
  { id: 'ended-b', threadId: 'thread-ended-b', state: 'ENDED', project: 'beta', fileSizeBytes: 2 * 1024 * 1024, lastActivityAtMs: 1_700_000_100_000 },
  { id: 'live-c', threadId: 'thread-live-c', state: 'LIVE', project: 'alpha', fileSizeBytes: 1024 * 1024, lastActivityAtMs: 1_700_000_200_000 }
];

test('storage surface shows totals, cursor, selected size and protected sessions without overflow', () => {
  const selectedIds = new Set(['ended-a']);
  const summary = buildSessionStorageSummary(rows, { nowMs: 1_700_000_300_000 });
  const selectedSummary = summarizeSelectedSessions(rows, selectedIds);
  const frame = renderStorageManager({ summary, selectedSummary, selectedIds, rows, cursorIndex: 1, width: 120, height: 32, mode: 'mono' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.match(text, /STORAGE MANAGER/);
  assert.match(text, /7\.0M/);
  assert.match(text, /Selected\s+1 sessions\s+4\.0M/);
  assert.match(text, /\[x\].*alpha/);
  assert.match(text, /\[-\].*alpha.*LIVE/);
  assert.match(text, /SESSIONS BY SIZE 2\/3/);
  assert.match(text, /▸ \[ \].*beta/);
  assert.match(text, /BY PROJECT/);
  assert.match(text, /BY AGE/);
  assert.match(stripAnsi(frame.lines.at(-1)), /↑↓ move.*Space toggle.*C clear.*M\/Q back/);
  assert.ok(frame.lines.length <= 32);
  assert.ok(frame.lines.every((line) => cellWidth(line) <= 120));
});

test('storage session viewport follows cursor through a list longer than the panel', () => {
  const many = Array.from({ length: 40 }, (_, index) => ({
    id: `ended-${index}`,
    threadId: `thread-${String(index).padStart(3, '0')}`,
    state: 'ENDED',
    project: `project-${index}`,
    fileSizeBytes: (40 - index) * 1024,
    lastActivityAtMs: 1_700_000_000_000 + index
  }));
  const summary = buildSessionStorageSummary(many, { nowMs: 1_700_000_300_000 });
  const frame = renderStorageManager({ summary, selectedSummary: summarizeSelectedSessions(many, []), selectedIds: new Set(), rows: many, cursorIndex: 30, width: 120, height: 24, mode: 'mono' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.match(text, /SESSIONS BY SIZE 31\/40/);
  assert.match(text, /▸ \[ \].*project-30/);
  assert.ok(frame.lines.every((line) => cellWidth(line) <= 120));
});

test('clear confirmation is explicit and bounded', () => {
  const selectedIds = new Set(['ended-a', 'ended-b']);
  const selectedSummary = summarizeSelectedSessions(rows, selectedIds);
  const frame = renderClearConfirmation({ rows, selectedIds, selectedSummary, width: 100, height: 24, mode: 'mono' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.match(text, /CLEAR 2 ENDED SESSIONS · 6\.0M\?/);
  assert.match(text, /Y.*confirm clear/);
  assert.match(text, /N \/ Esc.*cancel/);
  assert.match(text, /LIVE and uncertain sessions are always protected/);
  assert.ok(frame.lines.every((line) => cellWidth(line) <= 100));
});
