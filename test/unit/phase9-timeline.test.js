import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HistoryEngine } from '../../src/history/engine.js';
import { createSelectedSessionDetail } from '../../src/manager/detail-view.js';
import { renderSessionInspect } from '../../src/manager/inspect-render.js';
import { filterSessionTimeline, nextTimelineFilter } from '../../src/manager/timeline.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

function line(type, payload = {}, timestamp = '2026-08-26T12:00:00.000Z', outer = null) {
  const body = outer
    ? { type: outer, timestamp, payload: { type, ...payload } }
    : { type, timestamp, payload };
  return `${JSON.stringify(body)}\n`;
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p9-timeline-'));
}

test('selected deep history retains meaningful audit events and pairs tool results', () => {
  const root = tempDir();
  const filePath = path.join(root, 'audit.jsonl');
  fs.writeFileSync(filePath, [
    line('session_meta', { id: 'thread-audit', model: 'gpt-x', cwd: 'C:/repo/audit' }, '2026-08-26T12:00:00.000Z'),
    line('user_message', { message: 'Check repository state' }, '2026-08-26T12:00:01.000Z', 'event_msg'),
    line('turn_started', { turn_id: 't1' }, '2026-08-26T12:00:02.000Z', 'event_msg'),
    line('function_call', {
      call_id: 'c-shell',
      name: 'exec_command',
      arguments: JSON.stringify({ cmd: 'git status --short', cwd: 'C:/repo/audit' })
    }, '2026-08-26T12:00:03.000Z', 'response_item'),
    line('function_call_output', {
      call_id: 'c-shell',
      output: ' M src/manager/tui.js',
      exit_code: 0
    }, '2026-08-26T12:00:04.500Z', 'response_item'),
    line('custom_tool_call', {
      call_id: 'c-agent',
      name: 'spawn_agent',
      input: { task: 'review tests' }
    }, '2026-08-26T12:00:05.000Z', 'response_item'),
    line('custom_tool_call_output', {
      call_id: 'c-agent',
      output: 'agent started'
    }, '2026-08-26T12:00:05.500Z', 'response_item'),
    line('error', { message: 'example failure' }, '2026-08-26T12:00:06.000Z', 'event_msg'),
    line('turn_complete', { turn_id: 't1' }, '2026-08-26T12:00:08.000Z', 'event_msg')
  ].join(''));

  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  const model = engine.load(meta.id);
  const detail = createSelectedSessionDetail({ ...meta, state: 'ENDED', project: 'audit' }, model);

  assert.equal(detail.timeline === model.timeline, true, 'selected detail should reference sanitized deep timeline without cloning');
  assert.ok(detail.timeline.length >= 8);
  assert.ok(detail.timeline.some((event) => event.category === 'user' && event.label.includes('Check repository state')));

  const shell = detail.timeline.find((event) => event.category === 'shell');
  assert.equal(shell.command, 'git status --short');
  assert.equal(shell.cwd, 'C:/repo/audit');

  const result = detail.timeline.find((event) => event.category === 'result' && event.group === 'shell');
  assert.equal(result.command, 'git status --short');
  assert.equal(result.output, 'M src/manager/tui.js');
  assert.equal(result.exitCode, 0);
  assert.equal(result.durationMs, 1500);

  assert.ok(detail.timeline.some((event) => event.category === 'agent' && event.tool === 'spawn_agent'));
  assert.ok(detail.timeline.some((event) => event.category === 'error' && event.label.includes('example failure')));
  assert.equal(detail.turns.lastDurationMs, 6000);

  const shellOnly = filterSessionTimeline(detail.timeline, { filter: 'shell' });
  assert.equal(shellOnly.length, 2, 'shell filter should include call and paired result');
  const searched = filterSessionTimeline(detail.timeline, { filter: 'all', search: 'git status' });
  assert.equal(searched.length, 2, 'search should match call and inherited result audit fields');
  assert.equal(nextTimelineFilter('all'), 'tools');
  assert.equal(nextTimelineFilter('turns'), 'all');

  fs.rmSync(root, { recursive: true, force: true });
});

test('timeline inspect is responsive and exposes event detail without raw usage noise', () => {
  const detail = {
    state: 'LIVE',
    info: { project: 'audit', threadId: 'thread-audit', model: 'gpt-x', cwd: 'C:/repo/audit', startedAtMs: 1, lastEventAtMs: 10, fileSizeBytes: 1000, parsedLines: 9 },
    tokens: {},
    turns: { count: 1, completed: 1, lastDurationMs: 6000 },
    tools: { count: 1, byName: [] },
    resources: { evidence: [] },
    errors: [],
    timeline: [
      { index: 0, atMs: Date.parse('2026-08-26T12:00:03Z'), category: 'shell', group: 'shell', label: 'git status --short', rawType: 'function_call', tool: 'exec_command', callId: 'c1', command: 'git status --short', cwd: 'C:/repo/audit' },
      { index: 1, atMs: Date.parse('2026-08-26T12:00:04Z'), category: 'result', group: 'shell', label: 'exec_command result', rawType: 'function_call_output', tool: 'exec_command', callId: 'c1', command: 'git status --short', output: 'clean', exitCode: 0, durationMs: 1000 }
    ]
  };

  for (const [width, height] of [[60, 20], [120, 32], [180, 40]]) {
    const frame = renderSessionInspect({ detail, width, height, mode: 'mono', activeTab: 'timeline', timelineSelectedIndex: 0 });
    assert.ok(frame.lines.length <= height);
    assert.ok(frame.lines.every((entry) => cellWidth(entry) <= width));
    const text = stripAnsi(frame.lines.join('\n'));
    assert.match(text, /TIMELINE \/ AUDIT/);
    assert.match(text, /git status --short/);
    assert.match(text, /FILTER ALL/);

    const detailFrame = renderSessionInspect({ detail, width, height, mode: 'mono', activeTab: 'timeline', timelineSelectedIndex: 1, timelineDetail: true });
    const detailText = stripAnsi(detailFrame.lines.join('\n'));
    assert.match(detailText, /EVENT DETAIL/);
    assert.match(detailText, /Output\s+clean/);
    assert.match(detailText, /Exit code\s+0/);
  }
});
