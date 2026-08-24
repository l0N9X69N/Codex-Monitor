import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { renderHistoryFrame } from '../../src/history/render.js';
import { normalizeHistoryInput } from '../../src/history/input.js';
import { detectHistoryColorMode } from '../../src/history/theme.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';
import { runHistoryTui } from '../../src/history/app.js';

const session = { id: 'a', name: 'session-a', sizeBytes: 1234, modifiedAtMs: Date.parse('2026-08-25T00:00:00Z') };
const model = {
  info: { threadId: 't1', model: 'gpt-x', reasoning: 'medium', cwd: 'C:/repo', startedAtMs: 1, lastEventAtMs: 2 },
  tokens: { input: 100, cached: 20, output: 30, reasoning: 4, contextWindow: 200000, contextUsed: 1000 },
  turns: { count: 3, completed: 3, lastDurationMs: 500 },
  tools: { count: 1, byName: { shell: 1 } },
  resources: { evidence: [{ kind: 'MCP', value: 'server.tool' }] },
  errors: []
};

test('History renderer stays within normal and ultrawide terminal cells', () => {
  for (const [width, height] of [[60, 18], [100, 30], [160, 40]]) {
    const frame = renderHistoryFrame({ sessions: [session], selectedModel: model, width, height, mode: 'mono' });
    assert.ok(frame.lines.length <= height);
    assert.ok(frame.lines.every((line) => cellWidth(line) <= width));
    assert.match(frame.lines.join('\n'), /SESSIONS/);
  }
});

test('History Storage entry is read-only and advertises Phase 11 safety boundary', () => {
  const frame = renderHistoryFrame({ sessions: [session], selectedModel: model, width: 100, height: 30, mode: 'mono', storageMode: true });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.match(text, /STORAGE/);
  assert.match(text, /read-only/i);
  assert.match(text, /Phase 11/i);
  assert.doesNotMatch(text, /delete now/i);
});

test('History input supports keyboard, mouse wheel and Storage', () => {
  assert.equal(normalizeHistoryInput('\x1b[A'), 'up');
  assert.equal(normalizeHistoryInput('\x1b[B'), 'down');
  assert.equal(normalizeHistoryInput('s'), 'storage');
  assert.equal(normalizeHistoryInput('\x1b[<64;10;5M'), 'up');
  assert.equal(normalizeHistoryInput('\x1b[<65;10;5M'), 'down');
  const click = normalizeHistoryInput('\x1b[<0;10;5M');
  assert.equal(click.action, 'mouse');
  assert.equal(click.x, 10);
});

test('History color capability falls back truecolor -> 256 -> 16 -> mono', () => {
  assert.equal(detectHistoryColorMode({ COLORTERM: 'truecolor', TERM: 'xterm-256color' }), 'truecolor');
  assert.equal(detectHistoryColorMode({ TERM: 'xterm-256color' }), '256');
  assert.equal(detectHistoryColorMode({ TERM: 'xterm' }), '16');
  assert.equal(detectHistoryColorMode({ TERM: 'dumb' }), 'mono');
  assert.equal(detectHistoryColorMode({ NO_COLOR: '1', TERM: 'xterm-256color' }), 'mono');
});

test('History TUI enters alternate screen and restores terminal on quit', async () => {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = (value) => { stdin.isRaw = value; };
  stdin.resume = () => {};
  stdin.pause = () => {};
  const stdout = new EventEmitter();
  stdout.isTTY = true;
  stdout.columns = 80;
  stdout.rows = 24;
  stdout.output = '';
  stdout.write = (data) => { stdout.output += String(data); return true; };
  const engine = { discover: () => [], ensureLoaded: () => null, tail: () => ({ changed: false }) };
  const running = runHistoryTui({ engine, stdin, stdout, colorMode: 'mono' });
  setImmediate(() => stdin.emit('data', Buffer.from('q')));
  const code = await running;
  assert.equal(code, 0);
  assert.match(stdout.output, /\x1b\[\?1049h/);
  assert.match(stdout.output, /\x1b\[\?1049l/);
  assert.match(stdout.output, /\x1b\[\?25h/);
  assert.equal(stdin.isRaw, false);
});
