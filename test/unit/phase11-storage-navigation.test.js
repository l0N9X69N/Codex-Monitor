import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createFakePlatformAdapter } from '../../src/platform/fake.js';
import { runSessionManagerTui } from '../../src/manager/tui.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p11-nav-'));
}

function writeSession(root, name, sizeRank, mtimeMs) {
  const filePath = path.join(root, `${name}.jsonl`);
  const lines = [
    JSON.stringify({
      type: 'session_meta',
      timestamp: new Date(mtimeMs - 60_000).toISOString(),
      payload: { id: `thread-${name}`, model: 'gpt-x', cwd: `C:/${name}` }
    }),
    JSON.stringify({
      type: 'response_item',
      timestamp: new Date(mtimeMs - 30_000).toISOString(),
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'x'.repeat(sizeRank * 200) }] }
    })
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
  const time = new Date(mtimeMs);
  fs.utimesSync(filePath, time, time);
  return filePath;
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
  stdout.columns = 140;
  stdout.rows = 34;
  stdout.output = '';
  stdout.write = (data) => { stdout.output += String(data); return true; };
  return { stdin, stdout };
}

test('storage view advertises entry, moves cursor and toggles the highlighted ended session', async () => {
  const root = tempDir();
  const base = Date.now() - 60_000;
  const largest = writeSession(root, 'largest', 6, base + 3000);
  const middle = writeSession(root, 'middle', 4, base + 2000);
  writeSession(root, 'small', 2, base + 1000);
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

  setTimeout(() => {
    stdin.emit('data', Buffer.from('m'));
    stdin.emit('data', Buffer.from('\x1b[B'));
    stdin.emit('data', Buffer.from(' '));
    setImmediate(() => {
      stdin.emit('data', Buffer.from('q'));
      setImmediate(() => stdin.emit('data', Buffer.from('q')));
    });
  }, 40);

  const result = await running;
  assert.equal(result.code, 0);
  assert.equal(result.storageCursorIndex, 1);
  assert.equal(result.clearSelectedIds.size, 1);
  assert.equal(result.clearSelectedIds.has(middle), true);
  assert.equal(result.clearSelectedIds.has(largest), false);
  assert.match(stdout.output, /M storage/);
  assert.match(stdout.output, /STORAGE MANAGER/);
  assert.match(stdout.output, /SESSIONS BY SIZE 2\/3/);
  assert.match(stdout.output, /\[x\].*middle/);
  assert.match(stdout.output, /↑↓ move.*Space toggle.*C clear/);
  assert.equal(stdin.isRaw, false);

  fs.rmSync(root, { recursive: true, force: true });
});

test('storage selection shortcuts stay inert on the main dashboard', async () => {
  const root = tempDir();
  const base = Date.now() - 60_000;
  writeSession(root, 'one', 4, base + 2000);
  writeSession(root, 'two', 2, base + 1000);
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

  setTimeout(() => {
    for (const key of ['a', 'n', 'i', 'c', ' ', 'A', 'N', 'I', 'C']) stdin.emit('data', Buffer.from(key));
    setImmediate(() => stdin.emit('data', Buffer.from('q')));
  }, 40);

  const result = await running;
  assert.equal(result.code, 0);
  assert.equal(result.clearSelectedIds.size, 0);
  assert.doesNotMatch(stdout.output, /CODEX \/\/ STORAGE MANAGER/);
  assert.doesNotMatch(stdout.output, /STORAGE CLEAR CONFIRMATION/);
  assert.match(stdout.output, /M storage/);
  assert.equal(stdin.isRaw, false);

  fs.rmSync(root, { recursive: true, force: true });
});

test('clear key stays scoped after returning from storage to dashboard', async () => {
  const root = tempDir();
  const base = Date.now() - 60_000;
  const selected = writeSession(root, 'selected', 4, base + 1000);
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

  setTimeout(() => {
    stdin.emit('data', Buffer.from('m'));
    stdin.emit('data', Buffer.from(' '));
    stdin.emit('data', Buffer.from('m'));
    stdin.emit('data', Buffer.from('c'));
    setImmediate(() => stdin.emit('data', Buffer.from('q')));
  }, 40);

  const result = await running;
  assert.equal(result.code, 0);
  assert.equal(result.clearSelectedIds.size, 1);
  assert.equal(result.clearSelectedIds.has(selected), true);
  assert.doesNotMatch(stdout.output, /STORAGE CLEAR CONFIRMATION/);
  assert.equal(stdin.isRaw, false);

  fs.rmSync(root, { recursive: true, force: true });
});
