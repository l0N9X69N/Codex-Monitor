import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSelectedSessionDetail, MANAGER_DETAIL_TABS } from '../../src/manager/detail-view.js';
import { SessionManagerCore } from '../../src/manager/session-core.js';

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p8-detail-')); }
function line(obj) { return `${JSON.stringify(obj)}\n`; }

function sampleSession() {
  return [
    line({ type: 'session_meta', timestamp: '2026-08-25T00:00:00Z', payload: { id: 'thread-detail', model: 'gpt-detail', reasoning_effort: 'high', cwd: 'C:/work/detail' } }),
    line({ type: 'turn_started', timestamp: '2026-08-25T00:00:01Z', payload: { id: 'turn-1' } }),
    line({ type: 'mcp_tool_call_begin', timestamp: '2026-08-25T00:00:02Z', payload: { call_id: 'm1', name: 'mcp.read' } }),
    line({ type: 'token_count', timestamp: '2026-08-25T00:00:03Z', payload: { info: { total_token_usage: { input_tokens: 120, cached_input_tokens: 20, output_tokens: 30, reasoning_output_tokens: 5 }, last_token_usage: { total_tokens: 80 }, model_context_window: 200000 } } }),
    line({ type: 'error', timestamp: '2026-08-25T00:00:04Z', payload: { message: 'retryable failure' } }),
    line({ type: 'turn_complete', timestamp: '2026-08-25T00:00:05Z', payload: { id: 'turn-1' } })
  ].join('');
}

test('selected detail exposes stable six-tab contract', () => {
  const detail = createSelectedSessionDetail(
    { id: 's1', state: 'ENDED', project: 'demo', filePath: '/tmp/s1.jsonl', sizeBytes: 123 },
    {
      filePath: '/tmp/s1.jsonl',
      info: { threadId: 't1', model: 'gpt-x', reasoning: 'medium', cwd: '/tmp/demo', startedAtMs: 1000, lastEventAtMs: 5000 },
      tokens: { input: 10, cached: 2, output: 3, reasoning: 1, contextWindow: 100, contextUsed: 40 },
      turns: { count: 2, completed: 2, lastDurationMs: 1200 },
      tools: { count: 3, byName: { shell: 2, read: 1 }, recent: [{ atMs: 4000, name: 'shell', callId: 'c1' }] },
      resources: { evidence: [{ kind: 'MCP', value: 'read', atMs: 3500 }] },
      errors: [{ atMs: 4500, detail: 'boom' }],
      parsedLines: 8,
      rejectedLines: 1
    }
  );
  assert.deepEqual(detail.tabs, MANAGER_DETAIL_TABS);
  assert.equal(detail.info.durationMs, 4000);
  assert.equal(detail.tokens.contextUsed, 40);
  assert.deepEqual(detail.tools.byName, [{ name: 'shell', count: 2 }, { name: 'read', count: 1 }]);
  assert.deepEqual(detail.resources.evidence, [{ kind: 'MCP', value: 'read', atMs: 3500 }]);
  assert.deepEqual(detail.errors, [{ atMs: 4500, detail: 'boom' }]);
});

test('missing historical values remain null/empty and are not fabricated', () => {
  const detail = createSelectedSessionDetail(
    { id: 'missing', state: 'UNKNOWN', filePath: '/tmp/missing.jsonl' },
    { info: {}, tokens: {}, turns: {}, tools: {}, resources: {}, errors: [], parsedLines: 0, rejectedLines: 0 }
  );
  assert.equal(detail.info.model, null);
  assert.equal(detail.info.durationMs, null);
  assert.equal(detail.tokens.input, null);
  assert.equal(detail.tokens.contextWindow, null);
  assert.deepEqual(detail.resources.evidence, []);
  assert.deepEqual(detail.errors, []);
  assert.equal(Object.prototype.hasOwnProperty.call(detail, 'cost'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(detail, 'system'), false);
});

test('SessionManagerCore selectedDetail follows selected tail and disappears on release', () => {
  const root = tempDir();
  const file = path.join(root, 'detail.jsonl');
  fs.writeFileSync(file, sampleSession());
  const core = new SessionManagerCore({ sessionsPath: root });
  const [meta] = core.discover();
  assert.equal(core.selectedDetail(), null);
  core.select(meta.id);
  let detail = core.selectedDetail();
  assert.equal(detail.info.threadId, 'thread-detail');
  assert.equal(detail.info.model, 'gpt-detail');
  assert.equal(detail.turns.count, 1);
  assert.equal(detail.tools.count, 1);
  assert.equal(detail.tokens.input, 120);
  assert.equal(detail.resources.evidence.length, 1);
  assert.ok(detail.errors.length >= 1);

  fs.appendFileSync(file, line({ type: 'turn_started', timestamp: '2026-08-25T00:00:06Z', payload: { id: 'turn-2' } }));
  core.tailSelected();
  detail = core.selectedDetail();
  assert.equal(detail.turns.count, 2);

  core.releaseSelection();
  assert.equal(core.selectedDetail(), null);
  assert.equal(core.deep.cache.size, 0);
  fs.rmSync(root, { recursive: true, force: true });
});
