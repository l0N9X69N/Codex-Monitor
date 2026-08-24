import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runCodexLive } from '../../src/runtime/live-runner.js';

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
    dataHandler: null,
    exitHandler: null,
    onData(handler) { this.dataHandler = handler; },
    onExit(handler) {
      this.exitHandler = handler;
      if (Number.isFinite(autoExitCode)) setImmediate(() => handler({ exitCode: autoExitCode }));
    },
    write(value) { this.writes.push(value); },
    resize() {},
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
