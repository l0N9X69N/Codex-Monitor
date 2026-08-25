import test from 'node:test';
import assert from 'node:assert/strict';
import { createNormalizedMonitorState } from '../../src/core/normalized-state.js';
import { applyNormalizedEvent } from '../../src/core/reducer.js';
import { PROVENANCE } from '../../src/core/provenance.js';
import { parseRolloutLine } from '../../src/parsers/rollout-event.js';
import { IncrementalJsonlParser } from '../../src/parsers/jsonl-incremental.js';
import { parsePtyTransient, PtyTransientStreamParser } from '../../src/parsers/pty-transient.js';
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

test('approval priority survives tool lifecycle until explicit resolution', () => {
  const state = createNormalizedMonitorState();
  applyNormalizedEvent(state, { kind: 'turn-start', atMs: 1, turnId: 't1' });
  applyNormalizedEvent(state, { kind: 'tool-start', atMs: 2, callId: 'c1', tool: 'exec' });
  applyNormalizedEvent(state, { kind: 'approval', atMs: 3, detail: 'approval prompt' });
  assert.equal(state.activity.state.value, 'APPROVAL');
  assert.equal(state.activity.approvalPending.value, true);
  applyNormalizedEvent(state, { kind: 'tool-start', atMs: 4, callId: 'c1', tool: 'exec' });
  assert.equal(state.activity.state.value, 'APPROVAL');
  applyNormalizedEvent(state, { kind: 'approval-resolved', atMs: 5 });
  assert.equal(state.activity.approvalPending.value, false);
  assert.equal(state.activity.state.value, 'TOOL');
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

test('Codex event_msg and response_item envelopes use payload.type', () => {
  const turn = parse({
    timestamp: '2026-08-24T10:00:00.000Z',
    type: 'event_msg',
    payload: { type: 'turn_started', turn_id: 't-envelope' }
  });
  assert.equal(turn.kind, 'turn-start');
  assert.equal(turn.turnId, 't-envelope');

  const tool = parse({
    timestamp: '2026-08-24T10:00:01.000Z',
    type: 'response_item',
    payload: { type: 'function_call', call_id: 'c-envelope', name: 'shell' }
  });
  assert.equal(tool.kind, 'tool-start');
  assert.equal(tool.callId, 'c-envelope');
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

test('PTY transient parser recognizes the real Codex command approval prompt', () => {
  const events = parsePtyTransient('Would you like to run the following command? Environment: local', 123);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'approval');
});

test('streaming PTY parser recognizes approval split across child output chunks and its resolution', () => {
  const parser = new PtyTransientStreamParser();
  assert.deepEqual(parser.push('Would you like to run the following ', 100), []);
  const prompt = parser.push('command? Environment: local', 101);
  assert.equal(prompt.length, 1);
  assert.equal(prompt[0].kind, 'approval');
  const duplicate = parser.push(' 1. Yes, proceed', 102);
  assert.equal(duplicate.filter((item) => item.kind === 'approval').length, 0);
  const resolved = parser.push(' You approved Codex to run Remove-Item this time', 103);
  assert.equal(resolved.some((item) => item.kind === 'approval-resolved'), true);
});

test('PTY transient parser does not treat static permissions/status text as a live approval prompt', () => {
  assert.deepEqual(parsePtyTransient('Permissions: Workspace (Ask for approval when needed)', 123), []);
  assert.deepEqual(parsePtyTransient('Tip: Use /status to see the current model, approvals, and token usage.', 123), []);
  const resolved = parsePtyTransient('You approved Codex to run Remove-Item this time', 123);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].kind, 'approval-resolved');
});

test('actual model only changes on explicit actual-model evidence', () => {
  const state = createNormalizedMonitorState();
  applyNormalizedEvent(state, parse(event('session_meta', { model: 'requested-x' })));
  assert.equal(state.model.requested.value, 'requested-x');
  assert.equal(state.model.actual.value, null);
  applyNormalizedEvent(state, parse(event('model_reroute', { to: 'effective-y' })));
  assert.equal(state.model.actual.value, 'effective-y');
});
