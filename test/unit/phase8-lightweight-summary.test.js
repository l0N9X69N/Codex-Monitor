import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HistoryEngine } from '../../src/history/engine.js';
import { LightweightSessionSummaries } from '../../src/manager/lightweight-summary.js';

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p8-row-')); }
function line(obj) { return `${JSON.stringify(obj)}\n`; }
function itemFor(filePath, state = 'ENDED') {
  const stat = fs.statSync(filePath);
  return {
    id: filePath,
    filePath,
    name: path.basename(filePath, '.jsonl'),
    state,
    threadId: 'thread-row',
    project: 'repo',
    cwd: 'C:/repo',
    model: 'gpt-row',
    startedAtMs: Date.parse('2026-08-25T00:00:00Z'),
    modifiedAtMs: stat.mtimeMs,
    sizeBytes: stat.size
  };
}

function sessionText() {
  return [
    line({ type: 'session_meta', timestamp: '2026-08-25T00:00:00Z', payload: { id: 'thread-row', model: 'gpt-row', cwd: 'C:/repo' } }),
    line({ type: 'turn_started', timestamp: '2026-08-25T00:00:01Z', payload: { id: 't1' } }),
    line({ type: 'exec_command_begin', timestamp: '2026-08-25T00:00:02Z', payload: { call_id: 'c1', name: 'shell' } }),
    line({ type: 'token_count', timestamp: '2026-08-25T00:00:03Z', payload: { info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 30, reasoning_output_tokens: 5 }, last_token_usage: { total_tokens: 45 }, model_context_window: 200000 } } }),
    line({ type: 'stream_error', timestamp: '2026-08-25T00:00:04Z', payload: { message: 'retry once' } }),
    line({ type: 'context_compacted', timestamp: '2026-08-25T00:00:05Z', payload: {} })
  ].join('');
}

test('small rollout bootstrap yields complete lightweight row without deep parser', () => {
  const root = tempDir();
  const file = path.join(root, 'one.jsonl');
  fs.writeFileSync(file, sessionText());
  const summaries = new LightweightSessionSummaries({ maxBootstrapBytes: 128 * 1024 });
  const item = itemFor(file);
  summaries.bootstrap(item);
  const row = summaries.row(item, { nowMs: Date.parse('2026-08-25T00:00:10Z') });
  assert.equal(row.model, 'gpt-row');
  assert.equal(row.tokens.input, 100);
  assert.equal(row.tokens.contextWindow, 200000);
  assert.equal(row.turnCount, 1);
  assert.equal(row.toolCount, 1);
  assert.equal(row.countsComplete, true);
  assert.equal(row.recentRetries.length, 1);
  assert.equal(row.recentCompactions.length, 1);
  assert.equal(row.lastActivitySource, 'rollout-event');
  fs.rmSync(root, { recursive: true, force: true });
});

test('tail-only bootstrap keeps counts unknown instead of fabricating totals', () => {
  const root = tempDir();
  const file = path.join(root, 'large.jsonl');
  const padding = Array.from({ length: 100 }, (_, i) => line({ type: 'turn_started', timestamp: `2026-08-25T00:00:${String(i % 60).padStart(2, '0')}Z`, payload: { id: `t${i}` } })).join('');
  fs.writeFileSync(file, `${padding}${sessionText()}`);
  const summaries = new LightweightSessionSummaries({ maxBootstrapBytes: 512 });
  const item = itemFor(file);
  summaries.bootstrap(item);
  const row = summaries.row(item);
  assert.equal(row.countsComplete, false);
  assert.equal(row.turnCount, null);
  assert.equal(row.toolCount, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('incremental tail updates usage and event counters without duplicate reads', () => {
  const root = tempDir();
  const file = path.join(root, 'grow.jsonl');
  fs.writeFileSync(file, sessionText());
  const summaries = new LightweightSessionSummaries();
  let item = itemFor(file, 'LIVE');
  summaries.bootstrap(item);
  fs.appendFileSync(file, line({ type: 'turn_started', timestamp: '2026-08-25T00:00:06Z', payload: { id: 't2' } }));
  fs.appendFileSync(file, line({ type: 'exec_command_begin', timestamp: '2026-08-25T00:00:07Z', payload: { call_id: 'c2', name: 'shell' } }));
  fs.appendFileSync(file, line({ type: 'token_count', timestamp: '2026-08-25T00:00:08Z', payload: { info: { total_token_usage: { input_tokens: 180, output_tokens: 50 }, last_token_usage: { total_tokens: 70 }, model_context_window: 200000 } } }));
  item = itemFor(file, 'LIVE');
  assert.equal(summaries.tail(item).changed, true);
  let row = summaries.row(item, { nowMs: Date.parse('2026-08-25T00:00:09Z') });
  assert.equal(row.turnCount, 2);
  assert.equal(row.toolCount, 2);
  assert.equal(row.tokens.input, 180);
  assert.equal(summaries.tail(item).changed, false);
  row = summaries.row(item);
  assert.equal(row.turnCount, 2);
  assert.equal(row.toolCount, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('large observation gap degrades counts to unknown and marks gap', () => {
  const root = tempDir();
  const file = path.join(root, 'gap.jsonl');
  fs.writeFileSync(file, sessionText());
  const summaries = new LightweightSessionSummaries({ maxIncrementBytes: 256 });
  let item = itemFor(file);
  summaries.bootstrap(item);
  fs.appendFileSync(file, Array.from({ length: 30 }, (_, i) => line({ type: 'turn_started', timestamp: '2026-08-25T00:01:00Z', payload: { id: `g${i}` } })).join(''));
  item = itemFor(file);
  summaries.tail(item);
  const row = summaries.row(item);
  assert.equal(row.observationGap, true);
  assert.equal(row.countsComplete, false);
  assert.equal(row.turnCount, null);
  assert.equal(row.toolCount, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('truncate resets bounded summary safely', () => {
  const root = tempDir();
  const file = path.join(root, 'rotate.jsonl');
  fs.writeFileSync(file, sessionText());
  const summaries = new LightweightSessionSummaries();
  let item = itemFor(file);
  summaries.bootstrap(item);
  fs.writeFileSync(file, line({ type: 'session_meta', timestamp: '2026-08-25T02:00:00Z', payload: { id: 'new', model: 'gpt-new', cwd: 'C:/new' } }));
  item = itemFor(file);
  const result = summaries.tail(item);
  assert.equal(result.reset, true);
  assert.equal(result.summary.model, 'gpt-new');
  assert.equal(result.summary.countsComplete, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('selected deep model can upgrade lightweight totals to exact counts', () => {
  const root = tempDir();
  const file = path.join(root, 'deep.jsonl');
  fs.writeFileSync(file, sessionText());
  const summaries = new LightweightSessionSummaries({ maxBootstrapBytes: 128 });
  const item = itemFor(file);
  summaries.bootstrap(item);
  assert.equal(summaries.row(item).countsComplete, false);
  const engine = new HistoryEngine({ sessionsPath: root });
  const model = engine.ensureLoaded(file);
  summaries.adoptDeepModel(item, model);
  const row = summaries.row(item);
  assert.equal(row.countsComplete, true);
  assert.equal(row.turnCount, 1);
  assert.equal(row.toolCount, 1);
  assert.equal(row.tokens.input, 100);
  fs.rmSync(root, { recursive: true, force: true });
});
