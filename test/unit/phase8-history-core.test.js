import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HistoryEngine } from '../../src/history/engine.js';
import { parseMonitorArgs } from '../../src/cli/args.js';
import { PROVENANCE } from '../../src/core/provenance.js';

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p8-')); }
function line(obj) { return `${JSON.stringify(obj)}\n`; }
function sampleSession() {
  return [
    line({ type: 'session_meta', timestamp: '2026-08-25T00:00:00Z', payload: { id: 'thread-1', model: 'gpt-x', reasoning_effort: 'medium', cwd: 'C:/repo' } }),
    line({ type: 'turn_started', timestamp: '2026-08-25T00:00:01Z', payload: { id: 'turn-1' } }),
    line({ type: 'exec_command_begin', timestamp: '2026-08-25T00:00:02Z', payload: { call_id: 'c1', name: 'shell' } }),
    line({ type: 'exec_command_end', timestamp: '2026-08-25T00:00:03Z', payload: { call_id: 'c1' } }),
    line({ type: 'token_count', timestamp: '2026-08-25T00:00:04Z', payload: { info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 40, reasoning_output_tokens: 5 }, last_token_usage: { total_tokens: 60 }, model_context_window: 200000 } } }),
    line({ type: 'turn_complete', timestamp: '2026-08-25T00:00:05Z', payload: { id: 'turn-1' } })
  ].join('');
}

test('History discovery of 1000+ sessions stats metadata but does not deep parse', () => {
  const root = tempDir();
  for (let i = 0; i < 1001; i += 1) fs.writeFileSync(path.join(root, `s-${String(i).padStart(4, '0')}.jsonl`), '');
  let reads = 0;
  const fsRef = Object.create(fs);
  fsRef.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };
  const engine = new HistoryEngine({ sessionsPath: root, fsRef });
  const index = engine.discover();
  assert.equal(index.length, 1001);
  assert.equal(reads, 0);
  assert.ok(index.every((item) => item.parsed === false));
  fs.rmSync(root, { recursive: true, force: true });
});

test('selected History session parses lazily into historical normalized model', () => {
  const root = tempDir();
  const file = path.join(root, 'one.jsonl');
  fs.writeFileSync(file, sampleSession());
  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  assert.equal(meta.parsed, false);
  const model = engine.ensureLoaded(meta.id);
  assert.equal(meta.parsed, true);
  assert.equal(model.info.threadId, 'thread-1');
  assert.equal(model.tokens.input, 100);
  assert.equal(model.tools.count, 1);
  assert.equal(model.turns.completed, 1);
  assert.equal(model.normalized.session.threadId.provenance.source, PROVENANCE.OFFICIAL_HISTORY);
  fs.rmSync(root, { recursive: true, force: true });
});

test('History tail handles partial append, complete append and no duplicate', () => {
  const root = tempDir();
  const file = path.join(root, 'grow.jsonl');
  fs.writeFileSync(file, sampleSession());
  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  const model = engine.ensureLoaded(meta.id);
  const before = model.tools.count;
  const partial = JSON.stringify({ type: 'mcp_tool_call_begin', timestamp: '2026-08-25T00:00:06Z', payload: { call_id: 'm1', name: 'mcp.read' } });
  fs.appendFileSync(file, partial.slice(0, 25));
  const first = engine.tail(meta.id);
  assert.equal(first.changed, true);
  assert.equal(model.tools.count, before);
  fs.appendFileSync(file, `${partial.slice(25)}\n`);
  const second = engine.tail(meta.id);
  assert.equal(second.changed, true);
  assert.equal(model.tools.count, before + 1);
  assert.ok(model.resources.evidence.some((item) => item.kind === 'MCP'));
  const third = engine.tail(meta.id);
  assert.equal(third.changed, false);
  assert.equal(model.tools.count, before + 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('History truncation reloads safely and no database is created', () => {
  const root = tempDir();
  const file = path.join(root, 'rotate.jsonl');
  fs.writeFileSync(file, sampleSession());
  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  engine.ensureLoaded(meta.id);
  fs.writeFileSync(file, line({ type: 'session_meta', timestamp: '2026-08-25T01:00:00Z', payload: { id: 'thread-new' } }));
  const result = engine.tail(meta.id);
  assert.equal(result.reset, true);
  assert.equal(result.model.info.threadId, 'thread-new');
  assert.equal(fs.readdirSync(root).some((name) => /\.(db|sqlite|csv)$/i.test(name)), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('--history is Monitor-owned while -- --history forwards to official Codex', () => {
  const own = parseMonitorArgs(['--history']);
  const forwarded = parseMonitorArgs(['--', '--history']);
  assert.equal(own.action, 'history');
  assert.deepEqual(own.codexArgs, []);
  assert.equal(forwarded.action, 'run');
  assert.deepEqual(forwarded.codexArgs, ['--history']);
});
