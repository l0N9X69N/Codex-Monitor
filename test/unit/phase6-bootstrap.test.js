import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentRunState } from '../../src/core/state.js';
import { bootstrapAccountQuota } from '../../src/collectors/quota-bootstrap.js';
import { CurrentSessionTailer } from '../../src/collectors/current-session.js';
import { PROVENANCE } from '../../src/core/provenance.js';
import { isResumeIntent } from '../../src/runtime/live-data.js';

function tempSessions() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase6-'));
  const sessions = path.join(root, 'sessions');
  fs.mkdirSync(sessions, { recursive: true });
  return { root, sessions };
}

function jsonl(lines) {
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}

function tokenCount(timestamp, { input = 100, cached = 50, output = 20, context = 60, fiveHour = null, weekly = null } = {}) {
  const rateLimits = {};
  if (fiveHour) rateLimits.primary = { used_percent: fiveHour, window_minutes: 300, resets_at: 1_788_114_219 };
  if (weekly) rateLimits.secondary = { used_percent: weekly, window_minutes: 10080, resets_at: 1_788_514_219 };
  return {
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: output,
          reasoning_output_tokens: 5
        },
        last_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: context },
        model_context_window: 258000
      },
      rate_limits: rateLimits
    }
  };
}

test('new Login run bootstraps 5H/WEEK from latest local account evidence without hydrating session usage', () => {
  const { root, sessions } = tempSessions();
  try {
    const older = path.join(sessions, 'older.jsonl');
    const newer = path.join(sessions, 'newer.jsonl');
    fs.writeFileSync(older, jsonl([tokenCount('2026-08-24T09:00:00.000Z', { fiveHour: 36 })]));
    fs.writeFileSync(newer, jsonl([tokenCount('2026-08-25T09:00:00.000Z', { weekly: 18 })]));
    const oldTime = Date.now() - 10_000;
    fs.utimesSync(older, oldTime / 1000, oldTime / 1000);
    fs.utimesSync(newer, Date.now() / 1000, Date.now() / 1000);

    const state = createCurrentRunState({ startedAtMs: Date.now(), authMode: 'login' });
    const result = bootstrapAccountQuota(state, sessions);
    assert.deepEqual(new Set(result.found), new Set(['fiveHour', 'weekly']));
    assert.equal(state.quota.fiveHour.value.remainingPercent, 64);
    assert.equal(state.quota.weekly.value.remainingPercent, 82);
    assert.equal(state.quota.fiveHour.provenance.source, PROVENANCE.OFFICIAL_HISTORY);
    assert.equal(state.usage.inputTokens.value, null);
    assert.equal(state.context.usedTokens.value, null);
    assert.equal(state.session.lastEventAtMs.value, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('API run never bootstraps Login account quota', () => {
  const { root, sessions } = tempSessions();
  try {
    fs.writeFileSync(path.join(sessions, 'quota.jsonl'), jsonl([tokenCount('2026-08-25T09:00:00.000Z', { fiveHour: 36, weekly: 18 })]));
    const state = createCurrentRunState({ startedAtMs: Date.now(), authMode: 'api' });
    const result = bootstrapAccountQuota(state, sessions);
    assert.deepEqual(result.found, []);
    assert.equal(state.quota.fiveHour.value, null);
    assert.equal(state.quota.weekly.value, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resume intent hydrates durable telemetry from the selected old session while transient activity resets', () => {
  const { root, sessions } = tempSessions();
  try {
    const now = Date.now();
    const cwd = root;
    const filePath = path.join(sessions, 'resume.jsonl');
    const initial = jsonl([
      { timestamp: '2026-08-20T10:00:00.000Z', type: 'session_meta', payload: { id: 'resume-thread', cwd, model: 'gpt-test' } },
      { timestamp: '2026-08-20T10:00:01.000Z', type: 'turn_started', payload: { turn_id: 'old-turn' } },
      { timestamp: '2026-08-20T10:00:02.000Z', type: 'exec_command_begin', payload: { call_id: 'old-tool', name: 'exec' } },
      tokenCount('2026-08-20T10:00:03.000Z', { input: 1234, cached: 900, output: 77, context: 1111, fiveHour: 40, weekly: 20 }),
      { timestamp: '2026-08-20T10:00:05.000Z', type: 'turn_complete', payload: { turn_id: 'old-turn' } }
    ]);
    fs.writeFileSync(filePath, initial);

    const state = createCurrentRunState({ startedAtMs: now, authMode: 'login' });
    const tailer = new CurrentSessionTailer({ state, sessionsPath: sessions, cwd, now: () => now, resumeMode: true });

    fs.appendFileSync(filePath, jsonl([
      { timestamp: new Date(now).toISOString(), type: 'session_meta', payload: { id: 'resume-thread', cwd, model: 'gpt-test' } }
    ]));
    fs.utimesSync(filePath, now / 1000, now / 1000);

    const result = tailer.poll();
    assert.equal(result.bound, true);
    assert.equal(result.resumed, true);
    assert.equal(state.session.threadId.value, 'resume-thread');
    assert.equal(state.session.turnCount.value, 1);
    assert.equal(state.usage.inputTokens.value, 1234);
    assert.equal(state.usage.cachedInputTokens.value, 900);
    assert.equal(state.usage.outputTokens.value, 77);
    assert.equal(state.context.usedTokens.value, 1111);
    assert.equal(state.activity.state.value, 'IDLE');
    assert.equal(state.activity.approvalPending.value, false);
    assert.deepEqual(state.activity.activeTools.value, []);
    assert.equal(state.tools.current.value, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resume intent recognizes official Codex resume argument without consuming it', () => {
  assert.equal(isResumeIntent(['resume']), true);
  assert.equal(isResumeIntent(['--some-codex-arg', 'resume', 'abc']), true);
  assert.equal(isResumeIntent([]), false);
});
