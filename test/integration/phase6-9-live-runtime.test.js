import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { childOutputMayClobberHud, runCodexLive } from '../../src/runtime/live-runner.js';
import { createCurrentRunState } from '../../src/core/state.js';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { MonitorIngestPipeline } from '../../src/core/ingest.js';
import { buildLiveFrame } from '../../src/ui/live-renderer-responsive.js';

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

test('Live HUD is non-interactive: every stdin byte is forwarded to Codex unchanged', async () => {
  const io = fakeIo();
  const child = fakeChild();
  const state = createCurrentRunState({ startedAtMs: Date.now() });
  const config = normalizeConfig(configForPreset('full'));
  const running = runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    monitorState: state,
    monitorConfig: config,
    ...io,
    spawnPty: async () => child
  });

  await new Promise((resolve) => setImmediate(resolve));
  const chunks = [
    Buffer.from('hello'),
    Buffer.from('\x07'),
    Buffer.from('\x0c'),
    Buffer.from('\x1bOQ'),
    Buffer.from('\x1b[1;3C'),
    Buffer.from(' world\r')
  ];
  for (const chunk of chunks) io.stdin.emit('data', chunk);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(child.writes.join(''), chunks.map((chunk) => chunk.toString('utf8')).join(''));
  child.exit(0);
  assert.equal(await running, 0);
});

test('embedded TokenCount rate_limits populate semantic quota buckets and normalize reset timestamps', () => {
  const state = createCurrentRunState({ startedAtMs: Date.now() });
  const pipeline = new MonitorIngestPipeline(state);
  const line = JSON.stringify({
    timestamp: '2026-08-25T02:00:00.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 13000,
          cached_input_tokens: 10000,
          output_tokens: 19,
          reasoning_output_tokens: 0
        },
        last_token_usage: { input_tokens: 300, output_tokens: 19, total_tokens: 13319 },
        model_context_window: 258000
      },
      rate_limits: {
        primary: { used_percent: 20, window_minutes: 300, resets_at: 1788000000 },
        secondary: { used_percent: 16, window_minutes: 10080, resets_at: 17881142219 }
      }
    }
  });

  pipeline.pushRolloutChunk(`${line}\n`);

  assert.equal(state.quota.fiveHour.value.usedPercent, 20);
  assert.equal(state.quota.fiveHour.value.remainingPercent, 80);
  assert.equal(state.quota.weekly.value.usedPercent, 16);
  assert.equal(state.quota.weekly.value.remainingPercent, 84);
  assert.equal(state.quota.weekly.value.resetsAtMs, 1788114221900);
});

test('single Live dashboard hides dead navigation UI and formats quota reset/RAM for humans', () => {
  const state = createCurrentRunState({ startedAtMs: 1787620000000 });
  state.auth.mode.value = 'login';
  state.system.cpuPercent.value = 20;
  state.system.memoryBytes.value = 13_701_000_000;
  state.system.totalMemoryBytes.value = 34_100_000_000;
  state.session.turnCount.value = 2;
  state.session.lastTurnDurationMs.value = 1000;
  state.session.lastEventAtMs.value = 1787623196000;
  state.quota.fiveHour.value = null;
  state.quota.weekly.value = {
    remainingPercent: 84,
    windowMinutes: 10080,
    resetsAt: 17881142219,
    resetsAtMs: 1788114221900
  };
  const config = normalizeConfig(configForPreset('full'));
  const frame = buildLiveFrame({
    state,
    config,
    width: 180,
    height: 40,
    nowMs: 1787623200000,
    cwd: 'D:/App/Codex-Monitor'
  });
  const text = frame.lines.join('\n');

  assert.doesNotMatch(text, /\[overview\]|performance|processes|resources|Ctrl\+G|F2|F3|Alt\+|F4 History/i);
  assert.doesNotMatch(text, /17881142219/);
  assert.match(text, /WEEK.*84% left.*↻/);
  assert.match(text, /5H.*waiting/i);
  assert.match(text, /13\.7 GB\/34\.1 GB/);
  assert.equal(frame.semantic.interactive, false);
});

test('normal Codex output stays on zero-extra-repaint fast path; destructive VT output repairs HUD', async () => {
  const io = fakeIo();
  const child = fakeChild();
  const state = createCurrentRunState({ startedAtMs: Date.now() });
  const config = normalizeConfig(configForPreset('recommended'));
  const running = runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    monitorState: state,
    monitorConfig: config,
    ...io,
    spawnPty: async () => child,
    hudRepairIntervalMs: 5
  });

  await new Promise((resolve) => setImmediate(resolve));
  io.stdout.output = '';

  child.dataHandler('a');
  child.dataHandler('b');
  child.dataHandler('c');
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(io.stdout.output, 'abc');

  child.dataHandler('\x1b[2J');
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.match(io.stdout.output, /\x1b7/);

  child.exit(0);
  assert.equal(await running, 0);
});

test('HUD clobber detector ignores normal text and detects terminal-wide controls', () => {
  assert.equal(childOutputMayClobberHud('plain output'), false);
  assert.equal(childOutputMayClobberHud('\x1b[2J'), true);
  assert.equal(childOutputMayClobberHud('\x1b[r'), true);
  assert.equal(childOutputMayClobberHud('\x1b[?1049h'), true);
});

test('transient PTY events still update Monitor state while HUD repair stays bounded', async () => {
  const io = fakeIo();
  const child = fakeChild();
  const state = createCurrentRunState({ startedAtMs: Date.now() });
  const config = normalizeConfig(configForPreset('recommended'));
  const running = runCodexLive({
    codexPath: 'codex',
    auth: { mode: 'login', forced: false },
    monitorState: state,
    monitorConfig: config,
    ...io,
    spawnPty: async () => child,
    hudRepairIntervalMs: 15
  });

  await new Promise((resolve) => setImmediate(resolve));
  io.stdout.output = '';

  child.dataHandler('error: simulated failure');
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.match(io.stdout.output, /error: simulated failure/);
  assert.match(io.stdout.output, /\x1b7/);

  child.exit(0);
  assert.equal(await running, 0);
});
