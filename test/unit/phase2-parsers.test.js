import test from 'node:test';
import assert from 'node:assert/strict';
import { createNormalizedMonitorState } from '../../src/core/normalized-state.js';
import { applyNormalizedEvent } from '../../src/core/reducer.js';
import { PROVENANCE } from '../../src/core/provenance.js';
import { parseRolloutLine } from '../../src/parsers/rollout-event.js';
import { IncrementalJsonlParser } from '../../src/parsers/jsonl-incremental.js';
import { parsePtyTransient } from '../../src/parsers/pty-transient.js';
import { sanitizeText } from '../../src/core/sanitize.js';
import { event, usageEvent } from '../helpers/synthetic-session.js';

function parse(obj) {
  const result = parseRolloutLine(JSON.stringify(obj));
  assert.equal(result.ok, true);
  return result.event;
}

test('activity table: IDLE THINKING TOOL APPROVAL ERROR', () => {
  const state = createNormalizedMonitorState({ runId: 'p2' });
  assert.equal(state.activity.state.value, 'IDLE');
  applyNormalizedEvent(state, parse(event('turn_started', { turn_id: 't1' })));
  assert.equal(state.activity.state.value, 'THINKING');
  applyNormalizedEvent(state, parse(event('exec_command_begin', { call_id: 'c1', name: 'shell' })));
  assert.equal(state.activity.state.value, 'TOOL');
  applyNormalizedEvent(state, parse(event('exec_approval_request', { message: 'allow?' })));
  assert.equal(state.activity.state.value, 'APPROVAL');
  applyNormalizedEvent(state, parse(event('error', { message: 'boom' })));
  assert.equal(state.activity.state.value, 'ERROR');
});

test('concurrent tools remain TOOL until all calls end', () => {
  const state = createNormalizedMonitorState();
  applyNormalizedEvent(state, parse(event('turn_started')));
  applyNormalizedEvent(state, parse(event('exec_command_begin', { call_id: 'a' })));
  applyNormalizedEvent(state, parse(event('mcp_tool_call_begin', { call_id: 'b' })));
  assert.deepEqual(state.activity.activeTools.value, ['a', 'b']);
  applyNormalizedEvent(state, parse(event('exec_command_end', { call_id: 'a' })));
  assert.equal(state.activity.state.value, 'TOOL');
  applyNormalizedEvent(state, parse(event('mcp_tool_call_end', { call_id: 'b' })));
  assert.equal(state.activity.state.value, 'THINKING');
});

test('retry error compaction and turn lifecycle are normalized', () => {
  const state = createNormalizedMonitorState();
  applyNormalizedEvent(state, parse(event('turn_started', { turn_id: 't1' }, '2026-08-24T10:00:00.000Z')));
  applyNormalizedEvent(state, parse(event('stream_error', { message: 'retrying' }, '2026-08-24T10:00:01.000Z')));
  assert.equal(state.activity.retryCount.value, 1);
  applyNormalizedEvent(state, parse(event('context_compacted', {}, '2026-08-24T10:00:02.000Z')));
  assert.equal(state.compaction.count.value, 1);
  applyNormalizedEvent(state, parse(event('turn_complete', {}, '2026-08-24T10:00:05.000Z')));
  assert.equal(state.session.turnCount.value, 1);
  assert.equal(state.session.lastTurnDurationMs.value, 5000);
  assert.equal(state.session.lastTurnDurationMs.provenance.source, PROVENANCE.DERIVED);
  applyNormalizedEvent(state, parse(event('error', { message: 'failure' }, '2026-08-24T10:00:06.000Z')));
  assert.equal(state.activity.errorCount.value, 1);
  assert.equal(state.activity.state.value, 'ERROR');
});

test('usage preserves actual zero and derives context/cache without masquerading as official', () => {
  const state = createNormalizedMonitorState();
  applyNormalizedEvent(state, parse(usageEvent({ input: 100, cached: 0, output: 0, reasoning: 0, contextWindow: 1000, contextUsed: 250 })));
  assert.equal(state.usage.cachedInputTokens.value, 0);
  assert.equal(state.usage.outputTokens.value, 0);
  assert.equal(state.context.leftTokens.value, 750);
  assert.equal(state.context.leftTokens.provenance.source, PROVENANCE.DERIVED);
  assert.equal(state.context.windowTokens.provenance.source, PROVENANCE.OFFICIAL_CURRENT);
  assert.equal(state.usage.cacheRatio.value, 0);
  assert.equal(state.usage.cacheRatio.provenance.source, PROVENANCE.DERIVED);
});

test('unknown remains null rather than becoming zero', () => {
  const state = createNormalizedMonitorState();
  applyNormalizedEvent(state, parse(event('token_usage', { info: {} })));
  assert.equal(state.usage.inputTokens.value, null);
  assert.equal(state.context.usedTokens.value, null);
});

test('malformed JSON is rejected without throwing', () => {
  assert.deepEqual(parseRolloutLine('{broken'), { ok: false, error: 'malformed-json' });
});

test('incremental parser buffers partial appended line', () => {
  const parser = new IncrementalJsonlParser();
  const first = parser.push('{"type":"turn_started","payload":{"turn_id":"x"}');
  assert.equal(first.length, 0);
  const second = parser.push('}\n');
  assert.equal(second.length, 1);
  assert.equal(second[0].ok, true);
  assert.equal(second[0].event.kind, 'turn-start');
});

test('ANSI/control injection is removed before normalized detail', () => {
  const dirty = '\u001b[31mERROR\u001b[0m\u0007\nnext';
  assert.equal(sanitizeText(dirty), 'ERROR next');
  const parsed = parse(event('error', { message: dirty }));
  assert.equal(parsed.detail, 'ERROR next');
});

test('PTY transient parser is independent from renderer and sanitizes details', () => {
  const events = parsePtyTransient('\u001b[33mApproval required: allow this command?\u001b[0m', 123);
  assert.equal(events[0].kind, 'approval');
  assert.equal(events[0].atMs, 123);
  assert.equal(events[0].detail.includes('\u001b'), false);
});

test('actual model only changes on explicit actual-model evidence', () => {
  const state = createNormalizedMonitorState();
  applyNormalizedEvent(state, parse(event('session_meta', { model: 'requested-x' })));
  assert.equal(state.model.requested.value, 'requested-x');
  assert.equal(state.model.actual.value, null);
  applyNormalizedEvent(state, parse(event('model_reroute', { to: 'effective-y' })));
  assert.equal(state.model.actual.value, 'effective-y');
});
