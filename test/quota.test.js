import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuotaLine, parseResetEpoch } from '../src/quota.js';
import { colorForRemaining, formatCountdown, renderMonitor } from '../src/render.js';

test('parses current token_count rate limit shape', () => {
  const line = JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      rate_limits: {
        primary: { used_percent: 4, window_minutes: 300, resets_at: 2000000000 },
        secondary: { used_percent: 10, window_minutes: 10080, resets_at: 2000500000 }
      }
    }
  });
  const q = parseQuotaLine(line);
  assert.equal(q.fiveHour.remainingPercent, 96);
  assert.equal(q.weekly.remainingPercent, 90);
  assert.equal(q.fiveHour.windowMinutes, 300);
});

test('supports RFC3339 legacy reset values', () => {
  assert.equal(parseResetEpoch('2030-01-01T00:00:00Z'), 1893456000);
});

test('countdown formats compactly', () => {
  const now = Date.UTC(2030, 0, 1, 0, 0, 0);
  assert.equal(formatCountdown(now / 1000 + 2 * 3600 + 24 * 60, now), '2h24m');
  assert.equal(formatCountdown(now / 1000 + 5 * 86400 + 7 * 3600, now), '5d07h');
});

test('threshold boundaries are 61 green, 60 orange, 20 orange, 19 red', () => {
  assert.notEqual(colorForRemaining(61), colorForRemaining(60));
  assert.equal(colorForRemaining(60), colorForRemaining(20));
  assert.notEqual(colorForRemaining(20), colorForRemaining(19));
});

test('monitor renders two lines', () => {
  const lines = renderMonitor({
    fiveHour: { remainingPercent: 96, resetsAt: 2000000000 },
    weekly: { remainingPercent: 90, resetsAt: 2000500000 }
  }, 80, 1900000000000);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /96% left/);
  assert.match(lines[1], /90% left/);
});
