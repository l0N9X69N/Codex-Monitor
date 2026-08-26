import test from 'node:test';
import assert from 'node:assert/strict';
import { areaChartRows } from '../../src/manager/analytics-charts.js';
import { renderSessionInspect } from '../../src/manager/inspect-render.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

function detailFixture() {
  const turns = Array.from({ length: 13 }, (_, index) => ({
    index,
    startedAtMs: 1_700_000_000_000 + index * 10_000,
    durationMs: index < 2 ? null : 4_000 + index * 1_000,
    inputTokens: 100_000 + index * 25_000,
    cachedTokens: 90_000 + index * 24_000,
    uncachedInputTokens: 10_000 + index * 1_000,
    outputTokens: 500 + index * 30,
    reasoningTokens: 100 + index * 10,
    totalTokens: 100_500 + index * 25_030,
    contextUsed: 90_000 + index * 10_000,
    contextWindow: 258_400,
    toolCount: index % 4,
    completed: index >= 2,
    incomplete: index < 2
  }));
  const contextPoints = turns.map((turn, index) => ({
    atMs: turn.startedAtMs,
    used: turn.contextUsed,
    window: turn.contextWindow,
    percent: (turn.contextUsed / turn.contextWindow) * 100
  }));
  const tokenPoints = turns.map((turn) => ({
    atMs: turn.startedAtMs,
    input: turn.inputTokens,
    cached: turn.cachedTokens,
    uncachedInput: turn.uncachedInputTokens,
    output: turn.outputTokens,
    reasoning: turn.reasoningTokens,
    total: turn.totalTokens
  }));
  const toolEvents = Array.from({ length: 18 }, (_, index) => ({
    atMs: 1_700_000_000_000 + index * 5_000,
    name: 'exec',
    durationMs: 100 + index * 40,
    failed: false
  }));
  return {
    state: 'LIVE',
    info: {
      project: 'Codex Monitor', threadId: 'thread', model: 'gpt-x', reasoning: 'medium',
      startedAtMs: contextPoints[0].atMs, lastEventAtMs: contextPoints.at(-1).atMs,
      durationMs: contextPoints.at(-1).atMs - contextPoints[0].atMs,
      cwd: 'C:/repo', fileSizeBytes: 4_800_000, parsedLines: 405
    },
    // Keep the fixture just below the 82.5% rounding boundary while preserving
    // the same compact 213.2k display used by the real-session visual sample.
    tokens: { input: 5_400_000, cached: 5_200_000, output: 12_500, reasoning: 3_800, contextUsed: 213_150, contextWindow: 258_400 },
    turns: { count: 13, completed: 11, lastDurationMs: 19_000 },
    tools: { count: 30, byName: [{ name: 'exec', count: 30 }] },
    timeline: [], resources: { evidence: [] }, errors: [],
    analytics: {
      context: { points: contextPoints, compactions: [], currentUsed: 213_150, currentWindow: 258_400, peakPercent: 82 },
      tokens: { input: 5_400_000, cached: 5_200_000, uncachedInput: 200_000, output: 12_500, reasoning: 3_800, total: 5_412_500, points: tokenPoints },
      turns: { completed: 11, items: turns },
      tools: { total: 30, byName: [{ name: 'exec', count: 30 }], events: toolEvents },
      signals: []
    }
  };
}

test('multi-row chart surface uses requested vertical density', () => {
  const points = [1, 2, 5, 3, 8, 4].map((value, index) => ({ atMs: index * 1000, value }));
  const rows = areaChartRows(points, { width: 20, height: 4, accessor: (point) => point.value });
  assert.equal(rows.length, 4);
  assert.ok(rows.some((row) => row.trim().length > 0));
});

test('wide inspect analytics split into useful two-column panels without overflow', () => {
  const detail = detailFixture();
  const expectations = {
    tokens: ['TOKEN SUMMARY / CUMULATIVE', 'TOKEN I/O / TURN'],
    turns: ['TURN DYNAMICS', 'TURN HISTORY'],
    tools: ['TOOL DYNAMICS / SHARE', 'RECENT TOOL EVENTS']
  };
  for (const [tab, labels] of Object.entries(expectations)) {
    const frame = renderSessionInspect({ detail, width: 180, height: 40, mode: 'mono', activeTab: tab });
    const text = stripAnsi(frame.lines.join('\n'));
    for (const label of labels) assert.match(text, new RegExp(label.replaceAll('/', '\\/')));
    assert.ok(frame.lines.every((line) => cellWidth(line) <= 180), `${tab} overflow`);
    assert.ok(frame.lines.length <= 40, `${tab} height overflow`);
  }
});

test('info context stream is a hero chart with multiple visual rows', () => {
  const detail = detailFixture();
  const frame = renderSessionInspect({ detail, width: 160, height: 38, mode: 'mono', activeTab: 'info' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.match(text, /CONTEXT STREAM/);
  assert.match(text, /current 82%/);
  const contextLine = frame.lines.findIndex((line) => stripAnsi(line).includes('CONTEXT STREAM'));
  assert.ok(contextLine >= 0);
  const nonEmptyAfter = frame.lines.slice(contextLine + 1, contextLine + 5).filter((line) => stripAnsi(line).trim().length > 2);
  assert.ok(nonEmptyAfter.length >= 3, 'context hero should occupy multiple chart rows');
});
