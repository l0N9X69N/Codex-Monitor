import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createFakePlatformAdapter } from '../../src/platform/fake.js';
import { normalizeManagerInput, nextManagerScope, nextManagerSort, nextManagerView } from '../../src/manager/input.js';
import { sessionManagerSnapshotSignature } from '../../src/manager/runtime.js';
import { runSessionManagerTui } from '../../src/manager/tui.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p9-tui-'));
}

function sessionLine() {
  return `${JSON.stringify({
    type: 'session_meta',
    timestamp: '2026-08-26T00:00:00Z',
    payload: { id: 'thread-one', model: 'gpt-x', cwd: 'C:/repo' }
  })}\n`;
}

function fakeTerminal() {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = (value) => { stdin.isRaw = value; };
  stdin.resume = () => {};
  stdin.pause = () => {};

  const stdout = new EventEmitter();
  stdout.isTTY = true;
  stdout.columns = 120;
  stdout.rows = 32;
  stdout.output = '';
  stdout.write = (data) => { stdout.output += String(data); return true; };
  return { stdin, stdout };
}

test('Manager input normalizes navigation, search, filters, sorting, views and mouse wheel', () => {
  assert.equal(normalizeManagerInput('\x1b[A'), 'up');
  assert.equal(normalizeManagerInput('\x1b[B'), 'down');
  assert.equal(normalizeManagerInput('\x1b[C'), 'right');
  assert.equal(normalizeManagerInput('\x1b[D'), 'left');
  assert.equal(normalizeManagerInput('\t'), 'tab');
  assert.equal(normalizeManagerInput('/'), 'search');
  assert.equal(normalizeManagerInput('f'), 'filter');
  assert.equal(normalizeManagerInput('S'), 'sort');
  assert.equal(normalizeManagerInput('d'), 'direction');
  assert.equal(normalizeManagerInput('V'), 'view');
  assert.equal(normalizeManagerInput('\r'), 'inspect');
  assert.equal(normalizeManagerInput('q'), 'quit');
  assert.equal(normalizeManagerInput('!'), null);
  assert.equal(normalizeManagerInput('\x1b[<64;3;4M'), 'up');
  assert.equal(normalizeManagerInput('\x1b[<65;3;4M'), 'down');
  assert.deepEqual(normalizeManagerInput('abc', { searching: true }), { action: 'search-text', text: 'abc' });
  assert.equal(normalizeManagerInput('\x7f', { searching: true }), 'search-backspace');
  assert.equal(normalizeManagerInput('\r', { searching: true }), 'search-accept');
  assert.equal(normalizeManagerInput('\x1b', { searching: true }), 'search-cancel');
  assert.equal(nextManagerScope('all'), 'live');
  assert.equal(nextManagerScope('live'), 'ended');
  assert.equal(nextManagerScope('ended'), 'all');
  assert.equal(nextManagerSort('lastActivity'), 'context');
  assert.equal(nextManagerView('operations'), 'table');
  assert.equal(nextManagerView('table'), 'charts');
  assert.equal(nextManagerView('charts'), 'auto');
  assert.equal(nextManagerView('auto'), 'operations');
});

test('Manager snapshot signature repaints evidenced row changes but ignores elapsed clock-only drift', () => {
  const base = {
    rows: [{
      id: 'a', state: 'LIVE', project: 'repo', model: 'gpt-x', fileSizeBytes: 100,
      lastActivityAtMs: 10, elapsedMs: 1000,
      tokens: { input: 10, cached: 2, output: 3, reasoning: 1, contextUsed: 50, contextWindow: 100 },
      turnCount: 1, observedTurnCount: 1, toolCount: 1, observedToolCount: 1,
      recentErrors: [], recentRetries: [], recentCompactions: []
    }],
    processDiagnostics: { codexProcessCount: 1, codexRootCount: 1, mappedSessionCount: 1 },
    processError: null
  };
  const first = sessionManagerSnapshotSignature(base);
  const elapsedOnly = sessionManagerSnapshotSignature({
    ...base,
    rows: [{ ...base.rows[0], elapsedMs: 9000 }]
  });
  const tokenChanged = sessionManagerSnapshotSignature({
    ...base,
    rows: [{ ...base.rows[0], tokens: { ...base.rows[0].tokens, input: 11 } }]
  });
  assert.equal(elapsedOnly, first);
  assert.notEqual(tokenChanged, first);
});

test('Manager TUI switches view at runtime, ignores unknown input and restores terminal on quit', async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, 'one.jsonl'), sessionLine());
  const adapter = createFakePlatformAdapter({ paths: { sessions: root }, processTree: [] });
  const { stdin, stdout } = fakeTerminal();
  const processRef = new EventEmitter();

  const running = runSessionManagerTui({
    platformAdapter: adapter,
    stdin,
    stdout,
    processRef,
    colorCapability: 'mono',
    intervalMs: 50,
    initialViewMode: 'operations'
  });
  setImmediate(() => {
    stdin.emit('data', Buffer.from('!'));
    stdin.emit('data', Buffer.from('v'));
    setImmediate(() => stdin.emit('data', Buffer.from('q')));
  });
  const result = await running;

  assert.equal(result.code, 0);
  assert.equal(result.viewMode, 'table');
  assert.match(stdout.output, /TABLE/);
  assert.match(stdout.output, /\x1b\[\?1049h/);
  assert.match(stdout.output, /\x1b\[\?1049l/);
  assert.match(stdout.output, /\x1b\[\?25h/);
  assert.match(stdout.output, /\x1b\[\?1006l/);
  assert.equal(stdin.isRaw, false);
  assert.equal(adapter.calls.some((call) => call.name === 'spawnPty'), false);
  assert.equal(adapter.calls.filter((call) => call.name === 'cleanup').length, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('Enter on a chart does not inspect; table Enter opens inspect and inspect tabs navigate', async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, 'one.jsonl'), sessionLine());
  const adapter = createFakePlatformAdapter({ paths: { sessions: root }, processTree: [] });
  const { stdin, stdout } = fakeTerminal();
  const processRef = new EventEmitter();

  const running = runSessionManagerTui({
    platformAdapter: adapter,
    stdin,
    stdout,
    processRef,
    colorCapability: 'mono',
    intervalMs: 50,
    initialViewMode: 'operations'
  });

  setImmediate(() => {
    stdin.emit('data', Buffer.from('\t'));
    stdin.emit('data', Buffer.from('\r'));
    assert.doesNotMatch(stdout.output, /SESSION INSPECT/);
    stdin.emit('data', Buffer.from('\x1b[D'));
    stdin.emit('data', Buffer.from('\r'));
    setImmediate(() => {
      stdin.emit('data', Buffer.from('\t'));
      setImmediate(() => {
        stdin.emit('data', Buffer.from('q'));
        setImmediate(() => stdin.emit('data', Buffer.from('q')));
      });
    });
  });

  const result = await running;
  assert.equal(result.code, 0);
  assert.match(stdout.output, /SESSION INSPECT/);
  assert.match(stdout.output, /TOKENS/);
  assert.equal(stdin.isRaw, false);
  fs.rmSync(root, { recursive: true, force: true });
});
