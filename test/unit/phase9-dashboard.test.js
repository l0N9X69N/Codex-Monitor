import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionDashboardModel } from '../../src/manager/dashboard-model.js';
import { dashboardLayoutMode, renderSessionDashboard, resolveManagerViewMode } from '../../src/manager/dashboard-render.js';
import { renderSessionInspect } from '../../src/manager/inspect-render.js';
import { ManagerTelemetrySeries } from '../../src/manager/telemetry-series.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

function row(id, overrides = {}) {
  return {
    id,
    name: id,
    state: 'UNKNOWN',
    project: id,
    model: 'gpt-x',
    elapsedMs: 60_000,
    tokens: { input: 100, cached: 20, output: 30, reasoning: 5, contextUsed: 20_000, contextWindow: 200_000 },
    turnCount: 2,
    observedTurnCount: 2,
    toolCount: 1,
    observedToolCount: 1,
    recentErrors: [],
    recentRetries: [],
    recentCompactions: [],
    fileSizeBytes: 1024,
    lastActivityAtMs: 1000,
    modifiedAtMs: 1000,
    ...overrides
  };
}

const rows = [
  row('alpha', { state: 'LIVE', project: 'alpha', threadId: 'thread-alpha', lastActivityAtMs: 3000, tokens: { input: 1000, cached: 500, output: 200, reasoning: 50, contextUsed: 180_000, contextWindow: 200_000 }, toolCount: 6, recentRetries: [{ atMs: 1 }] }),
  row('beta', { state: 'ENDED', project: 'beta', threadId: 'thread-beta', lastActivityAtMs: 1000, tokens: { input: 400, cached: 10, output: 50, reasoning: 0, contextUsed: 100_000, contextWindow: 200_000 }, toolCount: 2, recentErrors: [{ atMs: 1 }] }),
  row('gamma', { state: 'LIVE', project: 'gamma', threadId: 'thread-gamma', lastActivityAtMs: 2000, tokens: { input: 50, cached: 0, output: 10, reasoning: 0, contextUsed: 40_000, contextWindow: 200_000 }, toolCount: 3, observedToolCount: 3, recentCompactions: [{ atMs: 1 }] })
];

test('dashboard model summarizes evidence and ranks primary charts without fabricating values', () => {
  const model = buildSessionDashboardModel(rows);
  assert.deepEqual({ live: model.summary.live, ended: model.summary.ended, unknown: model.summary.unknown, total: model.summary.total }, { live: 2, ended: 1, unknown: 0, total: 3 });
  assert.equal(Math.round(model.summary.highestContextPercent), 90);
  assert.equal(model.summary.highestContextSessionId, 'alpha');
  assert.equal(model.summary.recentErrors, 1);
  assert.equal(model.summary.recentRetries, 1);
  assert.equal(model.summary.recentCompactions, 1);
  assert.equal(model.charts.tokens[0].id, 'alpha');
  assert.equal(model.charts.context[0].id, 'alpha');
  assert.equal(model.charts.tools[0].id, 'alpha');
});

test('dashboard table supports live/ended scope, search, sort and stable selected row', () => {
  let model = buildSessionDashboardModel(rows, { scope: 'live', search: 'gam', sortBy: 'project', direction: 'asc' });
  assert.deepEqual(model.rows.map((item) => item.id), ['gamma']);
  assert.equal(model.selected.id, 'gamma');

  model = buildSessionDashboardModel(rows, { sortBy: 'context', direction: 'desc', selectedId: 'gamma' });
  assert.deepEqual(model.rows.map((item) => item.id), ['alpha', 'beta', 'gamma']);
  assert.equal(model.selected.id, 'gamma');
  assert.equal(model.selectedIndex, 2);

  model = buildSessionDashboardModel(rows, { scope: 'ended' });
  assert.deepEqual(model.rows.map((item) => item.id), ['beta']);
});

test('charts obey current scope and search instead of leaking hidden sessions', () => {
  const ended = buildSessionDashboardModel(rows, { scope: 'ended' });
  assert.deepEqual(ended.charts.tokens.map((item) => item.id), ['beta']);
  assert.deepEqual(ended.charts.context.map((item) => item.id), ['beta']);
  assert.deepEqual(ended.charts.tools.map((item) => item.id), ['beta']);

  const none = buildSessionDashboardModel(rows, { scope: 'live', search: 'beta' });
  assert.equal(none.rows.length, 0);
  assert.equal(none.charts.tokens.length, 0);
  assert.equal(none.charts.context.length, 0);
  assert.equal(none.charts.tools.length, 0);
});

test('rolling telemetry retains aggregate and per-live-session rates', () => {
  const series = new ManagerTelemetrySeries({ windowMs: 60_000, maxSamples: 60 });
  let snapshot = series.sample(rows, { scope: 'live', atMs: 1000 });
  assert.equal(snapshot.samples.length, 1);
  assert.equal(snapshot.latest.tokenRate, null);
  assert.equal(Math.round(snapshot.latest.contextPeak), 90);
  assert.equal(snapshot.latest.activeCount, 2);
  assert.equal(snapshot.sessions.length, 2);

  const grown = rows.map((item) => {
    if (item.id === 'alpha') return { ...item, tokens: { ...item.tokens, input: item.tokens.input + 600 }, toolCount: item.toolCount + 2 };
    if (item.id === 'gamma') return { ...item, tokens: { ...item.tokens, input: item.tokens.input + 100 }, toolCount: item.toolCount + 1 };
    return item;
  });
  snapshot = series.sample(grown, { scope: 'live', atMs: 2000 });
  assert.equal(Math.round(snapshot.latest.tokenRate), 42_000);
  assert.equal(Math.round(snapshot.latest.toolRate), 180);
  assert.equal(Math.round(snapshot.latest.contextPeak), 90);
  assert.equal(snapshot.sessions.length, 2);
  const alpha = snapshot.sessions.find((item) => item.id === 'alpha');
  const gamma = snapshot.sessions.find((item) => item.id === 'gamma');
  assert.equal(Math.round(alpha.latest.tokenRate), 36_000);
  assert.equal(Math.round(gamma.latest.tokenRate), 6_000);
  assert.equal(Math.round(alpha.latest.toolRate), 120);
  assert.equal(Math.round(gamma.latest.toolRate), 60);

  snapshot = series.sample(grown, { scope: 'ended', atMs: 3000 });
  assert.equal(snapshot.samples.length, 1);
  assert.equal(snapshot.latest.tokenRate, null);
  assert.equal(snapshot.latest.contextPeak, null);
  assert.equal(snapshot.latest.activeCount, 0);
  assert.equal(snapshot.sessions.length, 0);
});

test('responsive dashboard stays inside terminal cells for narrow/normal/wide/ultrawide across view modes', () => {
  const cases = [[60, 22, 'narrow'], [100, 30, 'normal'], [140, 36, 'wide'], [200, 44, 'ultrawide']];
  for (const viewMode of ['operations', 'table', 'charts', 'auto']) {
    for (const [width, height, expectedLayout] of cases) {
      const frame = renderSessionDashboard({ rows, width, height, mode: 'mono', viewMode });
      assert.equal(frame.layout, expectedLayout);
      assert.equal(dashboardLayoutMode(width), expectedLayout);
      assert.ok(frame.lines.length <= height);
      assert.ok(frame.lines.every((line) => cellWidth(line) <= width), `${viewMode}/${expectedLayout} must not overflow`);
      assert.match(stripAnsi(frame.lines.join('\n')), /SESSION MANAGER/);
    }
  }
});

function telemetryFixture() {
  return {
    sampleCount: 3,
    latest: { activeCount: 2, tokenRate: 600, contextPeak: 80, toolRate: 3 },
    samples: [
      { atMs: 1, activeCount: 2, tokenRate: 0, contextPeak: 20, toolRate: 0 },
      { atMs: 2, activeCount: 2, tokenRate: 1200, contextPeak: 45, toolRate: 6 },
      { atMs: 3, activeCount: 2, tokenRate: 600, contextPeak: 80, toolRate: 3 }
    ],
    sessions: [
      {
        id: 'alpha', project: 'alpha', threadId: 'thread-alpha', active: true,
        latest: { tokenRate: 500, context: 80, toolRate: 2 },
        samples: [
          { atMs: 1, tokenRate: 0, context: 20, toolRate: 0 },
          { atMs: 2, tokenRate: 900, context: 45, toolRate: 4 },
          { atMs: 3, tokenRate: 500, context: 80, toolRate: 2 }
        ]
      },
      {
        id: 'gamma', project: 'gamma', threadId: 'thread-gamma', active: true,
        latest: { tokenRate: 100, context: 20, toolRate: 1 },
        samples: [
          { atMs: 1, tokenRate: 0, context: 20, toolRate: 0 },
          { atMs: 2, tokenRate: 300, context: 20, toolRate: 2 },
          { atMs: 3, tokenRate: 100, context: 20, toolRate: 1 }
        ]
      }
    ]
  };
}

test('operations view prioritizes current state, semantic telemetry, selected session and recent sessions', () => {
  const text = stripAnsi(renderSessionDashboard({ rows, width: 150, height: 40, mode: 'mono', viewMode: 'operations', telemetry: telemetryFixture() }).lines.join('\n'));
  assert.match(text, /CURRENT \/ LIVE/);
  assert.match(text, /STATUS \/ EVENTS/);
  assert.match(text, /LIVE TELEMETRY · 60s/);
  assert.match(text, /TOKEN/);
  assert.match(text, /TOOLS/);
  assert.match(text, /CTX/);
  assert.match(text, /SELECTED SESSION/);
  assert.match(text, /RECENT SESSIONS/);
});

test('charts view uses semantic aggregate motion and per-live-session telemetry rows', () => {
  const charts = stripAnsi(renderSessionDashboard({ rows, width: 150, height: 44, mode: 'mono', viewMode: 'charts', telemetry: telemetryFixture() }).lines.join('\n'));
  assert.match(charts, /SYSTEM MOTION · LIVE ONLY · ROLLING 60s/);
  assert.match(charts, /LIVE SESSIONS · TOKEN SPARK \/ RATE \/ CONTEXT \/ TOOLS/);
  assert.match(charts, /alpha/);
  assert.match(charts, /gamma/);
  assert.match(charts, /TOP TOKEN TOTAL · current scope/);
  assert.match(charts, /TOP CONTEXT · current scope/);
  assert.match(charts, /RECENT \/ SELECT/);
  assert.doesNotMatch(charts, /TOKEN RATE · ROLLING 60s/);

  const table = stripAnsi(renderSessionDashboard({ rows, width: 150, height: 36, mode: 'mono', viewMode: 'table' }).lines.join('\n'));
  assert.match(table, /SESSION INDEX/);
  assert.match(table, /SESSION/);
  assert.doesNotMatch(table, /SYSTEM MOTION/);
});

test('auto view resolves from terminal geometry without changing data semantics', () => {
  assert.equal(resolveManagerViewMode('auto', 'narrow'), 'table');
  assert.equal(resolveManagerViewMode('auto', 'normal'), 'operations');
  assert.equal(resolveManagerViewMode('auto', 'wide'), 'operations');
  assert.equal(resolveManagerViewMode('auto', 'ultrawide'), 'charts');
  assert.equal(resolveManagerViewMode('operations', 'ultrawide'), 'operations');
});

test('selected row remains structurally visible in mono mode and table exposes session identity', () => {
  const text = stripAnsi(renderSessionDashboard({ rows, width: 150, height: 36, mode: 'mono', viewMode: 'table', selectedId: 'gamma' }).lines.join('\n'));
  assert.match(text, /SELECTED 2\/3/);
  assert.match(text, /SESSION/);
  assert.match(text, /▸\s+LIVE\s+gamma/);
});

test('selected inspect is visibly distinct, exact-session scoped and responsive', () => {
  const detail = {
    state: 'LIVE',
    info: { project: 'alpha', threadId: 'thread-alpha', model: 'gpt-x', reasoning: 'medium', cwd: 'C:/alpha', startedAtMs: 1000, lastEventAtMs: 61000, durationMs: 60000, fileSizeBytes: 2048, parsedLines: 12 },
    tokens: { input: 1000, cached: 500, output: 200, reasoning: 50, contextUsed: 180000, contextWindow: 200000 },
    turns: { count: 4, completed: 4 },
    tools: { count: 6 },
    errors: []
  };
  for (const [width, height] of [[60, 22], [120, 32], [180, 40]]) {
    const infoFrame = renderSessionInspect({ detail, width, height, mode: 'mono', activeTab: 'info' });
    assert.ok(infoFrame.lines.length <= height);
    assert.ok(infoFrame.lines.every((line) => cellWidth(line) <= width));
    const infoText = stripAnsi(infoFrame.lines.join('\n'));
    assert.match(infoText, /SESSION INSPECT/);
    assert.match(infoText, /IDENTITY/);
    assert.match(infoText, /thread-alpha/);
    assert.match(infoText, /Q\/Esc back/);
    if (width >= 92) assert.match(infoText, /EXACT TELEMETRY/);
    else assert.doesNotMatch(infoText, /EXACT TELEMETRY/);

    const tokensFrame = renderSessionInspect({ detail, width, height, mode: 'mono', activeTab: 'tokens' });
    assert.ok(tokensFrame.lines.length <= height);
    assert.ok(tokensFrame.lines.every((line) => cellWidth(line) <= width));
    const tokensText = stripAnsi(tokensFrame.lines.join('\n'));
    assert.match(tokensText, /TOKENS/);
    assert.match(tokensText, /Context\s+90%/);
    assert.match(tokensText, /Input\s+1\.0k/);
  }
});

test('empty and unmatched dashboard states render safely', () => {
  const empty = renderSessionDashboard({ rows: [], width: 80, height: 24, mode: 'mono' });
  assert.ok(empty.lines.every((line) => cellWidth(line) <= 80));
  assert.match(stripAnsi(empty.lines.join('\n')), /No sessions match current query/);

  const unmatched = renderSessionDashboard({ rows, search: 'does-not-exist', width: 100, height: 28, mode: 'mono' });
  assert.equal(unmatched.model.rows.length, 0);
  assert.match(stripAnsi(unmatched.lines.join('\n')), /No sessions match current query/);
});
