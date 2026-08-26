import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SelectedActivityPreview } from '../../src/manager/activity-preview.js';
import { renderSessionDashboardWithPreview } from '../../src/manager/dashboard-preview-render.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p9-preview-'));
}

function line(type, payload = {}, timestamp = '2026-08-26T14:45:00.000Z', outer = null) {
  const body = outer
    ? { type: outer, timestamp, payload: { type, ...payload } }
    : { type, timestamp, payload };
  return `${JSON.stringify(body)}\n`;
}

function row(filePath, size) {
  return {
    id: filePath,
    filePath,
    name: 'live',
    project: 'Codex Monitor',
    threadId: 'thread-live',
    state: 'LIVE',
    model: 'gpt-x',
    fileSizeBytes: size,
    lastActivityAtMs: Date.parse('2026-08-26T14:45:05Z'),
    tokens: { input: 100, cached: 20, output: 10, reasoning: 3, contextUsed: 20, contextWindow: 100 },
    turnCount: 1,
    observedTurnCount: 1,
    toolCount: 1,
    observedToolCount: 1,
    agentSpawnCount: 0,
    observedAgentSpawnCount: 0,
    recentErrors: [],
    recentRetries: [],
    recentCompactions: []
  };
}

test('selected activity preview appends new JSONL without deleting already visible events', () => {
  const root = tempDir();
  const filePath = path.join(root, 'live.jsonl');
  fs.writeFileSync(filePath, [
    line('turn_started', { turn_id: 't1' }, '2026-08-26T14:45:00.000Z', 'event_msg'),
    line('function_call', { call_id: 'c1', name: 'exec_command', arguments: JSON.stringify({ cmd: 'git status' }) }, '2026-08-26T14:45:01.000Z', 'response_item')
  ].join(''));

  const reader = new SelectedActivityPreview({ maxBytes: 64 * 1024, maxEvents: 16, refreshIntervalMs: 250 });
  let stat = fs.statSync(filePath);
  const first = reader.read(row(filePath, stat.size), { nowMs: 1000 });
  assert.ok(first.events.some((event) => event.label.includes('git status')));
  const firstCount = first.events.length;

  fs.appendFileSync(filePath, [
    line('function_call_output', { call_id: 'c1', output: 'clean', exit_code: 0 }, '2026-08-26T14:45:02.000Z', 'response_item'),
    line('turn_complete', { turn_id: 't1' }, '2026-08-26T14:45:03.000Z', 'event_msg')
  ].join(''));
  stat = fs.statSync(filePath);
  const second = reader.read(row(filePath, stat.size), { nowMs: 1400 });

  assert.ok(second.events.length > firstCount);
  assert.ok(second.events.some((event) => event.label.includes('git status')), 'existing preview event must survive append');
  assert.ok(second.events.some((event) => event.category === 'result'));
  assert.ok(second.events.some((event) => event.category === 'turn' && event.label === 'Turn completed'));

  fs.rmSync(root, { recursive: true, force: true });
});

test('ultrawide TABLE splits spare width into session evidence and selected activity', () => {
  const rows = [row('live.jsonl', 1024)];
  const activityPreview = {
    id: 'live.jsonl',
    project: 'Codex Monitor',
    session: 'thread-live',
    sizeBytes: 1024,
    sourceBytes: 1024,
    truncated: false,
    error: null,
    events: [
      { atMs: Date.parse('2026-08-26T14:45:01Z'), category: 'shell', group: 'shell', label: 'git status' },
      { atMs: Date.parse('2026-08-26T14:45:02Z'), category: 'result', group: 'shell', label: 'exec_command result', durationMs: 1000 }
    ]
  };
  const frame = renderSessionDashboardWithPreview({
    rows,
    width: 260,
    height: 42,
    mode: 'mono',
    selectedId: 'live.jsonl',
    selectedIndex: 0,
    viewMode: 'table',
    activityPreview
  });
  const text = stripAnsi(frame.lines.join('\n'));

  assert.ok(frame.lines.every((entry) => cellWidth(entry) <= 260));
  assert.match(text, /SESSION INDEX/);
  assert.match(text, /SELECTED ACTIVITY/);
  assert.match(text, /SESSIONS 1\/1/);
  assert.match(text, /OUTPUT/);
  assert.match(text, /REASON/);
  assert.match(text, /git status/);
});
