import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runCodexLive, splitMonitorHotkeys } from '../../src/runtime/live-runner.js';
import { createCurrentRunState } from '../../src/core/state.js';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { createFakePlatformAdapter } from '../../src/platform/fake.js';

function fakeIo() {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = (value) => { stdin.isRaw = value; };
  stdin.resume = () => {};
  stdin.pause = () => {};
  const stdout = new EventEmitter();
  stdout.isTTY = true;
  stdout.columns = 100;
  stdout.rows = 30;
  stdout.output = '';
  stdout.write = (value) => { stdout.output += String(value); return true; };
  const stderr = { output: '', write(value) { this.output += String(value); return true; } };
  const processRef = new EventEmitter();
  processRef.cpuUsage = () => ({ user: 1000, system: 1000 });
  processRef.memoryUsage = () => ({ rss: 50_000_000 });
  return { stdin, stdout, stderr, processRef };
}

function fakeChild() {
  return {
    pid: 4242,
    writes: [],
    dataHandler: null,
    exitHandler: null,
    onData(fn) { this.dataHandler = fn; },
    onExit(fn) { this.exitHandler = fn; },
    write(value) { this.writes.push(value); },
    resize() {},
    kill() {},
    exit(code = 0) { this.exitHandler?.({ exitCode: code }); }
  };
}

test('monitor hotkey splitter consumes Alt-arrow even when combined with other stdin bytes', () => {
  const parsed = splitMonitorHotkeys(`a\x1b[1;3Cb\x1b[1;3D`);
  assert.deepEqual(parsed.actions, ['next-view', 'previous-view']);
  assert.equal(parsed.forwarded, 'ab');
});

test('F4 opens History and Alt+Right changes Live view without forwarding hotkeys to Codex', async () => {
  const io = fakeIo();
  const child = fakeChild();
  const adapter = createFakePlatformAdapter({
    spawnPtyResult: child,
    paths: { sessions: null },
    historyTerminalResult: { ok: true },
    processTree: []
  });
  const state = createCurrentRunState({ startedAtMs: Date.now() });
  const config = normalizeConfig(configForPreset('recommended'));
  const running = runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    monitorState: state,
    monitorConfig: config,
    platformAdapter: adapter,
    ...io
  });

  setImmediate(() => {
    io.stdin.emit('data', Buffer.from('\x1bOS'));
    io.stdin.emit('data', Buffer.from('x\x1b[1;3Cy'));
    setImmediate(() => child.exit(0));
  });

  const code = await running;
  assert.equal(code, 0);
  assert.deepEqual(child.writes, ['xy']);
  assert.ok(adapter.calls.some((item) => item.name === 'openHistoryTerminal'));
  assert.equal(state.processes.rootPid.value, 4242);
  assert.match(io.stdout.output, /\[tools\]|\[Tools\]/i);
});
