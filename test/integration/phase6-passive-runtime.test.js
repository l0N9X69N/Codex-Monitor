import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runCodexLive, childOutputMayClobberHud } from '../../src/runtime/live-runner.js';
import { createCurrentRunState } from '../../src/core/state.js';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';

function fakeIo() {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = (value) => { stdin.isRaw = value; };
  stdin.resume = () => {};
  stdin.pause = () => {};
  const stdout = new EventEmitter();
  stdout.isTTY = true;
  stdout.columns = 140;
  stdout.rows = 40;
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
    resizes: [],
    dataHandler: null,
    exitHandler: null,
    onData(fn) { this.dataHandler = fn; },
    onExit(fn) { this.exitHandler = fn; },
    write(value) { this.writes.push(value); },
    resize(cols, rows) { this.resizes.push({ cols, rows }); },
    kill() {},
    exit(code = 0) { this.exitHandler?.({ exitCode: code }); }
  };
}

test('every normal/special stdin byte belongs to official Codex', async () => {
  const io = fakeIo();
  const child = fakeChild();
  const running = runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    monitorState: createCurrentRunState({ startedAtMs: Date.now() }),
    monitorConfig: normalizeConfig(configForPreset('full')),
    ...io,
    spawnPty: async () => child
  });
  await new Promise((resolve) => setImmediate(resolve));
  const chunks = [
    Buffer.from('abc'),
    Buffer.from('\x07'),
    Buffer.from('\x1b[A'),
    Buffer.from('\x1b[1;3D'),
    Buffer.from('\x1bOS'),
    Buffer.from('line1\r\nline2')
  ];
  for (const chunk of chunks) io.stdin.emit('data', chunk);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(child.writes.join(''), chunks.map((chunk) => chunk.toString('utf8')).join(''));
  child.exit(0);
  assert.equal(await running, 0);
});

test('normal output is not repainted while terminal-wide controls trigger bounded HUD repair', async () => {
  const io = fakeIo();
  const child = fakeChild();
  const running = runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    monitorState: createCurrentRunState({ startedAtMs: Date.now() }),
    monitorConfig: normalizeConfig(configForPreset('recommended')),
    ...io,
    spawnPty: async () => child,
    hudRepairIntervalMs: 5
  });
  await new Promise((resolve) => setImmediate(resolve));
  io.stdout.output = '';
  child.dataHandler('plain-output');
  await new Promise((resolve) => setTimeout(resolve, 12));
  assert.equal(io.stdout.output, 'plain-output');
  child.dataHandler('\x1b[2J');
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.match(io.stdout.output, /\x1b7/);
  child.exit(0);
  assert.equal(await running, 0);
});

test('first Windows resize event immediately updates the Codex PTY geometry', async () => {
  const io = fakeIo();
  const child = fakeChild();
  const running = runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    monitorState: createCurrentRunState({ startedAtMs: Date.now() }),
    monitorConfig: normalizeConfig(configForPreset('full')),
    ...io,
    spawnPty: async () => child,
    hudRepairIntervalMs: 5
  });
  await new Promise((resolve) => setImmediate(resolve));

  io.stdout.columns = 220;
  io.stdout.rows = 50;
  io.stdout.emit('resize');

  assert.ok(child.resizes.length >= 1);
  assert.equal(child.resizes[0].cols, 220);
  assert.ok(child.resizes[0].rows >= 8);

  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(child.resizes.at(-1).cols, 220);
  child.exit(0);
  assert.equal(await running, 0);
});

test('HUD clobber detector only flags terminal-wide controls', () => {
  assert.equal(childOutputMayClobberHud('plain output'), false);
  assert.equal(childOutputMayClobberHud('\x1b[2J'), true);
  assert.equal(childOutputMayClobberHud('\x1b[r'), true);
  assert.equal(childOutputMayClobberHud('\x1b[?1049h'), true);
});
