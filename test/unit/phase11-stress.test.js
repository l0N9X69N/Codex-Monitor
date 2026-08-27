import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createFakePlatformAdapter } from '../../src/platform/fake.js';
import { buildSessionStorageSummary, summarizeSelectedSessions } from '../../src/manager/storage-summary.js';
import { deleteSelectedSessions } from '../../src/manager/delete-safety.js';
import { renderStorageManager } from '../../src/manager/storage-render.js';
import { runSessionManagerTui } from '../../src/manager/tui.js';
import { cellWidth } from '../../src/ui/cell-width.js';

function tempRoot(prefix = 'codexm-p11-stress-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeEndedSession(root, name, { payloadBytes = 256, atMs = Date.now() - 60_000 } = {}) {
  const filePath = path.join(root, `${name}.jsonl`);
  const lines = [
    JSON.stringify({
      type: 'session_meta',
      timestamp: new Date(atMs - 2_000).toISOString(),
      payload: { id: `thread-${name}`, model: 'gpt-x', cwd: `C:/${name}` }
    }),
    JSON.stringify({
      type: 'response_item',
      timestamp: new Date(atMs - 1_000).toISOString(),
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'x'.repeat(payloadBytes) }] }
    })
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
  const time = new Date(atMs);
  fs.utimesSync(filePath, time, time);
  const stat = fs.statSync(filePath);
  return {
    id: filePath,
    filePath,
    name,
    threadId: `thread-${name}`,
    state: 'ENDED',
    project: name,
    fileSizeBytes: stat.size,
    sizeBytes: stat.size,
    modifiedAtMs: stat.mtimeMs,
    createdAtMs: stat.birthtimeMs,
    lastActivityAtMs: stat.mtimeMs
  };
}

function negativeEvidence() {
  return { processKnown: true, processMatch: false };
}

function fakeTerminal({ columns = 140, rows = 34 } = {}) {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = (value) => { stdin.isRaw = value; };
  stdin.resume = () => {};
  stdin.pause = () => {};

  const stdout = new EventEmitter();
  stdout.isTTY = true;
  stdout.columns = columns;
  stdout.rows = rows;
  stdout.output = '';
  stdout.write = (data) => { stdout.output += String(data); return true; };
  return { stdin, stdout };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('storage summary and storage surface stay bounded with ten thousand metadata rows', () => {
  const nowMs = Date.UTC(2026, 7, 27, 2, 0, 0);
  const rows = Array.from({ length: 10_000 }, (_, index) => ({
    id: `s-${index}`,
    filePath: `/sessions/s-${index}.jsonl`,
    threadId: `thread-${index}`,
    state: index % 17 === 0 ? 'LIVE' : index % 19 === 0 ? 'UNKNOWN' : 'ENDED',
    project: `project-${index % 31}`,
    fileSizeBytes: 1_024 + ((index * 97) % 4_000_000),
    modifiedAtMs: nowMs - (index % 120) * 86_400_000,
    lastActivityAtMs: nowMs - (index % 120) * 86_400_000
  }));

  const summary = buildSessionStorageSummary(rows, { nowMs, largestLimit: 8, projectLimit: 12 });
  assert.equal(summary.count, 10_000);
  assert.equal(summary.live + summary.ended + summary.unknown, 10_000);
  assert.equal(summary.byProject.length, 12);
  assert.equal(summary.largest.length, 8);
  assert.ok(summary.totalBytes > 0);

  const selectedIds = new Set(rows.filter((row) => row.state === 'ENDED').slice(0, 500).map((row) => row.id));
  const selectedSummary = summarizeSelectedSessions(rows, selectedIds);
  assert.equal(selectedSummary.count, 500);

  for (const [width, height] of [[60, 18], [100, 24], [160, 40], [240, 60]]) {
    const frame = renderStorageManager({
      summary,
      selectedSummary,
      selectedIds,
      rows,
      cursorIndex: 9_999,
      width,
      height,
      mode: 'mono'
    });
    assert.ok(frame.lines.length <= height, `height overflow at ${width}x${height}`);
    assert.ok(frame.lines.every((line) => cellWidth(line) <= width), `width overflow at ${width}x${height}`);
    assert.equal(frame.cursorIndex, 9_999);
  }
});

test('external deletion becomes a conservative rejection without blocking other selected deletes', () => {
  const root = tempRoot();
  try {
    const first = writeEndedSession(root, 'first');
    const vanished = writeEndedSession(root, 'vanished');
    const last = writeEndedSession(root, 'last');
    fs.unlinkSync(vanished.filePath);

    const report = deleteSelectedSessions(
      [first, vanished, last],
      new Set([first.id, vanished.id, last.id]),
      { sessionsPath: root, processEvidence: negativeEvidence }
    );

    assert.equal(report.deleted.length, 2);
    assert.equal(report.rejected.length, 1);
    assert.equal(report.rejected[0].id, vanished.id);
    assert.equal(report.rejected[0].reason, 'stat-failed');
    assert.equal(report.errors.length, 0);
    assert.equal(report.partial, true);
    assert.equal(fs.existsSync(first.filePath), false);
    assert.equal(fs.existsSync(last.filePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('partial unlink failure is reported while independent selected files continue deleting', () => {
  const root = tempRoot();
  try {
    const first = writeEndedSession(root, 'first');
    const blocked = writeEndedSession(root, 'blocked');
    const last = writeEndedSession(root, 'last');
    const fsRef = {
      lstatSync: (...args) => fs.lstatSync(...args),
      statSync: (...args) => fs.statSync(...args),
      unlinkSync(filePath) {
        if (path.resolve(filePath) === path.resolve(blocked.filePath)) {
          const error = new Error('simulated permission denied');
          error.code = 'EACCES';
          throw error;
        }
        return fs.unlinkSync(filePath);
      }
    };

    const report = deleteSelectedSessions(
      [first, blocked, last],
      new Set([first.id, blocked.id, last.id]),
      { sessionsPath: root, fsRef, processEvidence: negativeEvidence }
    );

    assert.equal(report.deleted.length, 2);
    assert.equal(report.rejected.length, 0);
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].id, blocked.id);
    assert.equal(report.errors[0].reason, 'delete-failed');
    assert.match(report.errors[0].error, /permission denied/);
    assert.equal(report.partial, true);
    assert.equal(fs.existsSync(first.filePath), false);
    assert.equal(fs.existsSync(blocked.filePath), true);
    assert.equal(fs.existsSync(last.filePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('storage delete cancellation keeps the selected temp session and restores terminal state', async () => {
  const root = tempRoot();
  try {
    const filePath = writeEndedSession(root, 'cancel-me').filePath;
    const adapter = createFakePlatformAdapter({ paths: { sessions: root }, processTree: [] });
    const { stdin, stdout } = fakeTerminal();
    const processRef = new EventEmitter();

    const running = runSessionManagerTui({
      platformAdapter: adapter,
      stdin,
      stdout,
      processRef,
      colorCapability: 'mono',
      intervalMs: 25,
      telemetryIntervalMs: 1000,
      initialViewMode: 'table'
    });

    await wait(50);
    stdin.emit('data', Buffer.from('m'));
    stdin.emit('data', Buffer.from(' '));
    stdin.emit('data', Buffer.from('c'));
    stdin.emit('data', Buffer.from('n'));
    await wait(10);
    stdin.emit('data', Buffer.from('q'));
    stdin.emit('data', Buffer.from('q'));

    const result = await running;
    assert.equal(result.code, 0);
    assert.equal(fs.existsSync(filePath), true);
    assert.match(stdout.output, /STORAGE DELETE CONFIRMATION/);
    assert.match(stdout.output, /Delete cancelled/);
    assert.equal(stdin.isRaw, false);
    assert.match(stdout.output, /\x1b\[\?1049l/);
    assert.match(stdout.output, /\x1b\[\?25h/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('storage RAW delete confirmation deletes exactly the highlighted temp ENDED session and restores terminal state', async () => {
  const root = tempRoot();
  try {
    const base = Date.now() - 60_000;
    const untouchedPath = writeEndedSession(root, 'untouched', { payloadBytes: 128, atMs: base - 5_000 }).filePath;
    const selectedPath = writeEndedSession(root, 'selected', { payloadBytes: 512, atMs: base }).filePath;
    const adapter = createFakePlatformAdapter({ paths: { sessions: root }, processTree: [] });
    const { stdin, stdout } = fakeTerminal();
    const processRef = new EventEmitter();

    const running = runSessionManagerTui({
      platformAdapter: adapter,
      stdin,
      stdout,
      processRef,
      colorCapability: 'mono',
      intervalMs: 25,
      telemetryIntervalMs: 1000,
      initialViewMode: 'table'
    });

    await wait(50);
    stdin.emit('data', Buffer.from('m'));
    stdin.emit('data', Buffer.from(' '));
    stdin.emit('data', Buffer.from('c'));
    stdin.emit('data', Buffer.from('y'));
    await wait(20);
    stdin.emit('data', Buffer.from('q'));
    stdin.emit('data', Buffer.from('q'));

    const result = await running;
    assert.equal(result.code, 0);
    assert.equal(result.deleteScope, 'raw');
    assert.equal(fs.existsSync(selectedPath), false);
    assert.equal(fs.existsSync(untouchedPath), true);
    assert.match(stdout.output, /STORAGE DELETE CONFIRMATION/);
    assert.match(stdout.output, /Deleted 1/);
    assert.equal(stdin.isRaw, false);
    assert.match(stdout.output, /\x1b\[\?1049l/);
    assert.match(stdout.output, /\x1b\[\?25h/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
