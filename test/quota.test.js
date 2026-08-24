import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  contextRemainingPercent,
  parseQuotaLine,
  parseResetEpoch,
  readLatestStateFromFile
} from '../src/quota.js';

test('maps 300-minute and weekly windows independently', () => {
  const q = parseQuotaLine(JSON.stringify({
    type: 'event_msg',
    timestamp: '2030-01-01T00:00:00Z',
    payload: {
      type: 'token_count',
      rate_limits: {
        primary: { used_percent: 36, window_minutes: 300, resets_at: 2000000000 },
        secondary: { used_percent: 18, window_minutes: 10080, resets_at: 2000500000 }
      }
    }
  }));
  assert.equal(q.fiveHour.remainingPercent, 64);
  assert.equal(q.weekly.remainingPercent, 82);
});

test('supports RFC3339 reset timestamps and Codex baseline context math', () => {
  assert.equal(parseResetEpoch('2030-01-01T00:00:00Z'), 1893456000);
  const remaining = contextRemainingPercent({
    contextWindow: 258000,
    last: { totalTokens: 79000 }
  });
  assert.equal(remaining, 73);
});

test('rollout state machine keeps TOOL active until output and exposes tool detail', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-quota-'));
  const file = path.join(dir, 'rollout-2030-01-01T00-00-00-demo.jsonl');
  const records = [
    { timestamp: '2030-01-01T00:00:01Z', type: 'event_msg', payload: { type: 'turn_started', turn_id: 't1' } },
    { timestamp: '2030-01-01T00:00:02Z', type: 'response_item', payload: { type: 'function_call', name: 'shell', call_id: 'c1' } },
    { timestamp: '2030-01-01T00:00:03Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 10, output_tokens: 2 }, last_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 }, model_context_window: 258000 } } }
  ];
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const active = readLatestStateFromFile(file);
  assert.equal(active.meta.activityState, 'TOOL');
  assert.equal(active.meta.lastToolName, 'shell');
  assert.equal(active.meta.activityDetail, 'running shell');

  fs.appendFileSync(file, JSON.stringify({ timestamp: '2030-01-01T00:00:04Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1' } }) + '\n');
  const after = readLatestStateFromFile(file);
  assert.equal(after.meta.activityState, 'THINKING');
  fs.rmSync(dir, { recursive: true, force: true });
});
