import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HistoryEngine } from '../../src/history/engine.js';
import { createSelectedSessionDetail } from '../../src/manager/detail-view.js';
import { renderSessionInspect } from '../../src/manager/inspect-render.js';
import {
  contextChartModel,
  cumulativeTokenChartModel,
  turnDurationChartModel,
  toolShareChartModel
} from '../../src/manager/analytics-charts.js';
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

function fixtureLines() {
  return [
    line('session_meta', { id: 'thread-p10', cwd: 'C:/repo/p10', model: 'gpt-x', reasoning_effort: 'high' }, '2026-08-27T12:00:00.000Z'),
    usage({ input: 100, cached: 40, output: 20, reasoning: 5, context: 120, window: 1000 }, '2026-08-27T12:00:01.000Z'),
    line('turn_started', { turn_id: 't1' }, '2026-08-27T12:00:02.000Z', 'event_msg'),
    usage({ input: 160, cached: 60, output: 40, reasoning: 12, context: 180, window: 1000 }, '2026-08-27T12:00:03.000Z'),
    line('function_call', { call_id: 'c1', name: 'exec', arguments: '{"cmd":"git status"}' }, '2026-08-27T12:00:04.000Z', 'response_item'),
    line('function_call_output', { call_id: 'c1', output: 'ok', exit_code: 0 }, '2026-08-27T12:00:04.500Z', 'response_item'),
    usage({ input: 220, cached: 80, output: 70, reasoning: 20, context: 240, window: 1000 }, '2026-08-27T12:00:05.000Z'),
    line('context_compacted', {}, '2026-08-27T12:00:06.000Z', 'event_msg'),
    usage({ input: 240, cached: 100, output: 75, reasoning: 21, context: 90, window: 1000 }, '2026-08-27T12:00:07.000Z'),
    line('turn_complete', { turn_id: 't1' }, '2026-08-27T12:00:08.000Z', 'event_msg')
  ];
}

function tempSession() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p10-'));
  const filePath = path.join(root, 'session.jsonl');
  fs.writeFileSync(filePath, fixtureLines().join(''));
  return { root, filePath };
}

test('deep history derives context token turn tool and compaction analytics from evidence', () => {
  const { root } = tempSession();
  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  const model = engine.load(meta.id);
  const detail = createSelectedSessionDetail({ ...meta, state: 'ENDED', project: 'p10', threadId: 'thread-p10', model: 'gpt-x' }, model);
  const analytics = detail.analytics;

  assert.ok(analytics);
  assert.equal(analytics.context.currentUsed, 90);
  assert.equal(Math.round(analytics.context.peakPercent), 24);
  assert.equal(analytics.context.compactions.length, 1);
  assert.equal(analytics.tokens.input, 240);
  assert.equal(analytics.tokens.cached, 100);
  assert.equal(analytics.tokens.uncachedInput, 140);
  assert.equal(analytics.tokens.output, 75);
  assert.equal(analytics.tokens.reasoning, 21);
  assert.equal(analytics.tokens.total, 315);

  assert.equal(analytics.turns.items.length, 1);
  const turn = analytics.turns.items[0];
  assert.equal(turn.durationMs, 6000);
  assert.equal(turn.inputTokens, 140);
  assert.equal(turn.cachedTokens, 60);
  assert.equal(turn.uncachedInputTokens, 80);
  assert.equal(turn.outputTokens, 55);
  assert.equal(turn.reasoningTokens, 16);
  assert.equal(turn.toolCount, 1);
  assert.equal(turn.contextUsed, 90);

  assert.equal(analytics.tools.total, 1);
  assert.equal(analytics.tools.byName[0].name, 'exec');
  assert.equal(analytics.tools.byName[0].count, 1);
  assert.equal(analytics.tools.events[0].durationMs, 500);
  assert.ok(analytics.signals.some((item) => item.kind === 'compaction'));

  fs.rmSync(root, { recursive: true, force: true });
});

test('selected LIVE tail appends analytics exactly once without full reload semantics', () => {
  const { root, filePath } = tempSession();
  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  const model = engine.load(meta.id);
  const beforeParsed = model.parsedLines;
  const beforeTurns = model.analytics.turns.items.length;
  const beforeTools = model.analytics.tools.total;

  fs.appendFileSync(filePath, [
    line('turn_started', { turn_id: 't2' }, '2026-08-27T12:01:00.000Z', 'event_msg'),
    line('function_call', { call_id: 'c2', name: 'exec', arguments: '{"cmd":"npm test"}' }, '2026-08-27T12:01:01.000Z', 'response_item'),
    line('function_call_output', { call_id: 'c2', output: 'ok', exit_code: 0 }, '2026-08-27T12:01:02.000Z', 'response_item'),
    usage({ input: 300, cached: 120, output: 100, reasoning: 30, context: 150, window: 1000 }, '2026-08-27T12:01:03.000Z'),
    line('turn_complete', { turn_id: 't2' }, '2026-08-27T12:01:05.000Z', 'event_msg')
  ].join(''));

  const first = engine.tail(meta.id);
  assert.equal(first.changed, true);
  assert.equal(first.reset, false);
  assert.equal(first.model.analytics.turns.items.length, beforeTurns + 1);
  assert.equal(first.model.analytics.tools.total, beforeTools + 1);
  assert.ok(first.model.parsedLines > beforeParsed);

  const afterParsed = first.model.parsedLines;
  const afterTurns = first.model.analytics.turns.items.length;
  const afterTools = first.model.analytics.tools.total;
  const second = engine.tail(meta.id);
  assert.equal(second.changed, false);
  assert.equal(second.model.parsedLines, afterParsed);
  assert.equal(second.model.analytics.turns.items.length, afterTurns);
  assert.equal(second.model.analytics.tools.total, afterTools);

  fs.rmSync(root, { recursive: true, force: true });
});

test('analytics chart models preserve known values and compaction markers', () => {
  const { root } = tempSession();
  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  const detail = createSelectedSessionDetail({ ...meta, state: 'ENDED', project: 'p10' }, engine.load(meta.id));

  const context = contextChartModel(detail.analytics, 30);
  const tokens = cumulativeTokenChartModel(detail.analytics, 30);
  const turns = turnDurationChartModel(detail.analytics, 30);
  const tools = toolShareChartModel(detail.analytics, 20);
  assert.equal(context.compactions, 1);
  assert.equal(Math.round(context.currentPercent), 9);
  assert.equal(Math.round(context.peakPercent), 24);
  assert.match(context.line, /◆/);
  assert.equal(tokens.total, 315);
  assert.equal(turns.maxDurationMs, 6000);
  assert.equal(tools.total, 1);
  assert.equal(tools.bars[0].label, 'exec');

  fs.rmSync(root, { recursive: true, force: true });
});

test('analytics inspect tabs stay responsive and expose evidence-backed charts/tables', () => {
  const { root } = tempSession();
  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  const detail = createSelectedSessionDetail({ ...meta, state: 'ENDED', project: 'p10' }, engine.load(meta.id));

  for (const tab of ['info', 'tokens', 'turns', 'tools', 'resources', 'errors']) {
    for (const [width, height] of [[60, 22], [120, 34], [220, 46]]) {
      const frame = renderSessionInspect({ detail, width, height, mode: 'mono', activeTab: tab });
      assert.ok(frame.lines.length <= height);
      assert.ok(frame.lines.every((entry) => cellWidth(entry) <= width), `${tab}/${width} overflow`);
    }
  }

  const info = stripAnsi(renderSessionInspect({ detail, width: 160, height: 38, mode: 'mono', activeTab: 'info' }).lines.join('\n'));
  const tokens = stripAnsi(renderSessionInspect({ detail, width: 120, height: 34, mode: 'mono', activeTab: 'tokens' }).lines.join('\n'));
  const turns = stripAnsi(renderSessionInspect({ detail, width: 140, height: 36, mode: 'mono', activeTab: 'turns' }).lines.join('\n'));
  const tools = stripAnsi(renderSessionInspect({ detail, width: 120, height: 34, mode: 'mono', activeTab: 'tools' }).lines.join('\n'));
  const resources = stripAnsi(renderSessionInspect({ detail, width: 120, height: 28, mode: 'mono', activeTab: 'resources' }).lines.join('\n'));

  assert.match(info, /CONTEXT STREAM/);
  assert.match(tokens, /CUMULATIVE TOKENS/);
  assert.match(tokens, /Uncached/);
  assert.match(turns, /TURN DURATION/);
  assert.match(turns, /START\s+DURATION\s+INPUT/);
  assert.match(tools, /TOOL SHARE/);
  assert.match(tools, /RECENT TOOL EVENTS/);
  assert.match(resources, /evidence-based/);

  fs.rmSync(root, { recursive: true, force: true });
});
