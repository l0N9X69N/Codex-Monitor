import test from 'node:test';
import assert from 'node:assert/strict';
import { createNormalizedMonitorState } from '../../src/core/normalized-state.js';
import { MonitorIngestPipeline } from '../../src/core/ingest.js';
import { jsonl, event, usageEvent } from '../helpers/synthetic-session.js';

test('rollout ingest updates one normalized state without exposing raw JSON', () => {
  const state = createNormalizedMonitorState({ runId: 'ingest' });
  const ingest = new MonitorIngestPipeline(state);
  const text = jsonl([
    event('session_meta', { id: 'thread-1', model: 'gpt-x', reasoning_effort: 'medium' }),
    event('turn_started', { turn_id: 't1' }),
    event('exec_command_begin', { call_id: 'c1', name: 'shell' }),
    usageEvent({ input: 100, cached: 20, contextWindow: 1000, contextUsed: 300 }),
    event('exec_command_end', { call_id: 'c1' }),
    event('turn_complete', {})
  ]);

  const results = ingest.pushRolloutChunk(text);
  assert.equal(results.every((x) => x.ok), true);
  assert.equal(ingest.stats.rolloutAccepted, 6);
  assert.equal(state.session.threadId.value, 'thread-1');
  assert.equal(state.model.requested.value, 'gpt-x');
  assert.equal(state.session.turnCount.value, 1);
  assert.equal(state.context.leftTokens.value, 700);
  assert.equal(state.activity.state.value, 'IDLE');
});

test('malformed and partial rollout chunks never corrupt normalized state', () => {
  const state = createNormalizedMonitorState();
  const ingest = new MonitorIngestPipeline(state);
  ingest.pushRolloutChunk('{broken}\n');
  assert.equal(ingest.stats.rolloutRejected, 1);
  assert.equal(state.session.turnCount.value, null);

  ingest.pushRolloutChunk('{"type":"turn_started","payload":{"turn_id":"x"}');
  assert.equal(state.session.turnInProgress.value, null);
  ingest.pushRolloutChunk('}\n');
  assert.equal(state.session.turnInProgress.value, true);
});

test('quota primary/secondary normalize into 5h/week buckets', () => {
  const state = createNormalizedMonitorState();
  const ingest = new MonitorIngestPipeline(state);
  ingest.pushRolloutChunk(jsonl([
    event('rate_limits', {
      primary: { used_percent: 25, window_minutes: 300, resets_at: 1000 },
      secondary: { used_percent: 10, window_minutes: 10080, resets_at: 2000 }
    })
  ]));
  assert.equal(state.quota.fiveHour.value.remainingPercent, 75);
  assert.equal(state.quota.weekly.value.remainingPercent, 90);
});

test('PTY transient events feed the same normalized activity state', () => {
  const state = createNormalizedMonitorState();
  const ingest = new MonitorIngestPipeline(state);
  ingest.pushPtyText('Approval required: allow this command?', 10);
  assert.equal(state.activity.state.value, 'APPROVAL');
  assert.equal(state.activity.source.value, 'pty');
});
