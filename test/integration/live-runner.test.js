import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runCodexLive } from '../../src/runtime/live-runner.js';
import { createDemoState } from '../../src/ui/demo.js';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';

function fakeIo() {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.rawCalls = [];
  stdin.setRawMode = (value) => { stdin.isRaw = value; stdin.rawCalls.push(value); };
  stdin.resume = () => {};
  stdin.pause = () => {};

  const stdout = new EventEmitter();
  stdout.isTTY = true;
  stdout.columns = 120;
  stdout.rows = 30;
  stdout.output = '';
  stdout.write = (value) => { stdout.output += String(value); };

  const stderr = { output: '', write(value) { this.output += String(value); } };
  const processRef = new EventEmitter();
  return { stdin, stdout, stderr, processRef };
}

function fakeChild({ autoExitCode = null } = {}) {
  const child = {
    killed: false,
    writes: [],
    resizes: [],
    dataHandler: null,
    exitHandler: null,
    onData(handler) { this.dataHandler = handler; },
    onExit(handler) {
      this.exitHandler = handler;
      if (Number.isFinite(autoExitCode)) setImmediate(() => handler({ exitCode: autoExitCode }));
    },
    write(value) { this.writes.push(value); },
    resize(cols, rows) { this.resizes.push([cols, rows]); },
    kill() { this.killed = true; }
  };
  return child;
}

test('normal child exit restores raw mode and returns child exit code', async () => {
  const io = fakeIo();
  const child = fakeChild({ autoExitCode: 7 });
  const code = await runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    ...io,
    spawnPty: async () => child
  });

  assert.equal(code, 7);
  assert.deepEqual(io.stdin.rawCalls, [true, false]);
  assert.equal(io.processRef.listenerCount('SIGTERM'), 0);
});

test('SIGTERM kills child, restores terminal, and returns signal exit code', async () => {
  const io = fakeIo();
  const child = fakeChild();
  const running = runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    ...io,
    spawnPty: async () => child
  });

  setImmediate(() => io.processRef.emit('SIGTERM'));
  const code = await running;

  assert.equal(code, 143);
  assert.equal(child.killed, true);
  assert.deepEqual(io.stdin.rawCalls, [true, false]);
});

test('Live monitor reserves a terminal scroll region above HUD and restores it on exit', async () => {
  const io = fakeIo();
  const child = fakeChild({ autoExitCode: 0 });
  const state = createDemoState('idle', { authMode: 'login', nowMs: 1000 });
  const config = normalizeConfig(configForPreset('recommended'));

  const code = await runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    monitorState: state,
    monitorConfig: config,
    ...io,
    spawnPty: async () => child
  });

  assert.equal(code, 0);
  assert.match(io.stdout.output, /\x1b\[1;\d+r/);
  assert.match(io.stdout.output, /\x1b\[r/);
});

test('resize keeps PTY height aligned with reserved scroll region', async () => {
  const io = fakeIo();
  const child = fakeChild();
  const state = createDemoState('idle', { authMode: 'login', nowMs: 1000 });
  const config = normalizeConfig(configForPreset('recommended'));
  const running = runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    monitorState: state,
    monitorConfig: config,
    ...io,
    spawnPty: async () => child
  });

  await new Promise((resolve) => setImmediate(resolve));
  io.stdout.columns = 90;
  io.stdout.rows = 24;
  io.stdout.emit('resize');
  await new Promise((resolve) => setTimeout(resolve, 90));

  assert.ok(child.resizes.length >= 1);
  const [, rows] = child.resizes.at(-1);
  assert.match(io.stdout.output, new RegExp(`\\x1b\\[1;${rows}r`));

  child.exitHandler({ exitCode: 0 });
  assert.equal(await running, 0);
});
