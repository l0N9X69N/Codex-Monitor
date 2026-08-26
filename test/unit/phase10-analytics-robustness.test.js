import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HistoryEngine } from '../../src/history/engine.js';
import { createSelectedSessionDetail } from '../../src/manager/detail-view.js';
import { renderSessionInspect } from '../../src/manager/inspect-render.js';
import {
  tokenIoByTurnChartModel,
  toolCallsByTurnChartModel
} from '../../src/manager/analytics-charts.js';
import { applySessionAnalyticsEvent, createSessionAnalytics } from '../../src/manager/session-analytics.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

function line(type, payload = {}, timestamp = '2026-08-27T12:00:00.000Z', outer = null) {
  const body = outer
    ? { type: outer, timestamp, payload: { type, ...payload } }
    : { type, timestamp, payload };
  return `${JSON.stringify(body)}\n`;
}

function usage({ input, cached, output, reasoning, context, window }, timestamp) {
  return line('token_count', {
    info: {
      total_token_usage: {
        input_tokens: input,
        cached_input_tokens: cached,
        output_tokens: output,
        reasoning_output_tokens: reasoning
      },
      last_token_usage: {
        input_tokens: input,
        output_tokens: output,
        total_tokens: context
      },
      model_context_window: window
    }
  }, timestamp, 'event_msg');
}

test('per-turn token and tool chart models expose evidenced peaks', () => {
  const analytics = {
    turns: {
      items: [
        { totalTokens: 100, toolCount: 1 },
        { totalTokens: 350, toolCount: 4 },
        { totalTokens: 220, toolCount: 2 }
      ]
    },
    tools: { total: 7, byName: [] }
  };
  const token = tokenIoByTurnChartModel(analytics, 20);
  const tools = toolCallsByTurnChartModel(analytics, 20);
  assert.equal(token.peakTokens, 350);
  assert.equal(tools.peakCalls, 4);
  assert.notEqual(token.line, '--');
  assert.notEqual(tools.line, '--');
});

test('turn ring pruning preserves active turn object semantics', () => {
  const analytics = createSessionAnalytics({ turnLimit: 32 });
  for (let index = 0; index < 40; index += 1) {
    const at = index * 10_000;
    applySessionAnalyticsEvent(analytics, { kind: 'turn-start', turnId: `t${index}`, atMs: at });
    applySessionAnalyticsEvent(analytics, {
      kind: 'usage',
      atMs: at + 1000,
      inputTokens: index * 100 + 100,
      cachedInputTokens: index * 40 + 40,
      outputTokens: index * 20 + 20,
      reasoningTokens: index * 5 + 5,
      contextUsed: 100 + index,
      contextWindow: 1000
    });
    applySessionAnalyticsEvent(analytics, { kind: 'turn-complete', turnId: `t${index}`, atMs: at + 5000 });
  }
  assert.equal(analytics.turns.items.length, 32);
  assert.equal(analytics.turns.items.at(-1).turnId, 't39');
  assert.equal(analytics.turns.items.at(-1).completed, true);
  assert.equal(analytics._activeTurn, null);
  assert.equal(analytics._lastCompletedTurn.turnId, 't39');
  assert.equal(analytics.turns.dropped, 8);
});

test('malformed and missing analytics evidence degrades safely without fabricated values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p10-malformed-'));
  const filePath = path.join(root, 'malformed.jsonl');
  fs.writeFileSync(filePath, [
    '{not-json}\n',
    line('session_meta', { id: 'thread-malformed', cwd: 'C:/repo/malformed' }),
    line('unknown_future_event', { foo: 'bar' }),
    line('function_call', { call_id: 'bad-tool', name: 'exec', arguments: '{"cmd":"exit 1"}' }, '2026-08-27T12:00:01.000Z', 'response_item'),
    line('function_call_output', { call_id: 'bad-tool', output: 'failed', exit_code: 1 }, '2026-08-27T12:00:02.000Z', 'response_item')
  ].join(''));

  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  const model = engine.load(meta.id);
  const detail = createSelectedSessionDetail({ ...meta, state: 'ENDED', project: 'malformed' }, model);

  assert.ok(detail.analytics);
  assert.ok(detail.info.rejectedLines >= 1);
  assert.equal(detail.analytics.tokens.total, null);
  assert.equal(detail.analytics.context.currentUsed, null);
  assert.equal(detail.analytics.turns.items.length, 0);
  assert.ok(detail.analytics.signals.some((item) => item.kind === 'tool-failure'));

  for (const tab of ['info', 'tokens', 'turns', 'tools', 'resources', 'errors']) {
    const frame = renderSessionInspect({ detail, width: 64, height: 22, mode: 'mono', activeTab: tab });
    assert.ok(frame.lines.every((entry) => cellWidth(entry) <= 64));
  }
  const tokenText = stripAnsi(renderSessionInspect({ detail, width: 90, height: 26, mode: 'mono', activeTab: 'tokens' }).lines.join('\n'));
  assert.match(tokenText, /total --/i);

  fs.rmSync(root, { recursive: true, force: true });
});

test('tokens and tools analytics render explicit per-turn dynamics', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p10-turn-dynamics-'));
  const filePath = path.join(root, 'session.jsonl');
  fs.writeFileSync(filePath, [
    usage({ input: 100, cached: 50, output: 20, reasoning: 5, context: 100, window: 1000 }, '2026-08-27T12:00:00.000Z'),
    line('turn_started', { turn_id: 't1' }, '2026-08-27T12:00:01.000Z', 'event_msg'),
    line('function_call', { call_id: 'c1', name: 'exec' }, '2026-08-27T12:00:02.000Z', 'response_item'),
    usage({ input: 250, cached: 120, output: 80, reasoning: 25, context: 220, window: 1000 }, '2026-08-27T12:00:03.000Z'),
    line('turn_complete', { turn_id: 't1' }, '2026-08-27T12:00:04.000Z', 'event_msg')
  ].join(''));
  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  const detail = createSelectedSessionDetail({ ...meta, state: 'ENDED', project: 'dynamics' }, engine.load(meta.id));

  const tokens = stripAnsi(renderSessionInspect({ detail, width: 120, height: 34, mode: 'mono', activeTab: 'tokens' }).lines.join('\n'));
  const tools = stripAnsi(renderSessionInspect({ detail, width: 120, height: 34, mode: 'mono', activeTab: 'tools' }).lines.join('\n'));
  assert.match(tokens, /TOKEN I\/O \/ TURN/);
  assert.match(tools, /TOOL CALLS \/ TURN/);

  fs.rmSync(root, { recursive: true, force: true });
});
