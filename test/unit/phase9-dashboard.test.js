import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionDashboardModel } from '../../src/manager/dashboard-model.js';
import { dashboardLayoutMode, renderSessionDashboard, resolveManagerViewMode } from '../../src/manager/dashboard-render.js';
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
  row('alpha', { state: 'LIVE', project: 'alpha', lastActivityAtMs: 3000, tokens: { input: 1000, cached: 500, output: 200, reasoning: 50, contextUsed: 180_000, contextWindow: 200_000 }, toolCount: 6, recentRetries: [{ atMs: 1 }] }),
  row('beta', { state: 'ENDED', project: 'beta', lastActivityAtMs: 1000, tokens: { input: 400, cached: 10, output: 50, reasoning: 0, contextUsed: 100_000, contextWindow: 200_000 }, toolCount: 2, recentErrors: [{ atMs: 1 }] }),
  row('gamma', { state: 'LIVE', project: 'gamma', lastActivityAtMs: 2000, tokens: { input: 50, cached: 0, output: 10, reasoning: 0, contextUsed: 40_000, contextWindow: 200_000 }, toolCount: null, observedToolCount: 3, recentCompactions: [{ atMs: 1 }] })
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

test('responsive dashboard stays inside terminal cells for narrow/normal/wide/ultrawide across view modes', () => {
  const cases = [
    [60, 22, 'narrow'],
    [100, 30, 'normal'],
    [140, 36, 'wide'],
    [200, 44, 'ultrawide']
  ];
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

test('operations view prioritizes LIVE and selected preview instead of telemetry wall', () => {
  const text = stripAnsi(renderSessionDashboard({ rows, width: 150, height: 40, mode: 'mono', viewMode: 'operations' }).lines.join('\n'));
  assert.match(text, /LIVE SESSIONS/);
  assert.match(text, /SELECTED PREVIEW/);
  assert.match(text, /TOKEN ACTIVITY/);
  assert.match(text, /RECENT \/ SESSIONS/);
  assert.doesNotMatch(text, /TOOL ACTIVITY/);
});

test('charts view exposes boxed primary charts while table view keeps charts secondary', () => {
  const charts = stripAnsi(renderSessionDashboard({ rows, width: 150, height: 40, mode: 'mono', viewMode: 'charts' }).lines.join('\n'));
  assert.match(charts, /TOKEN ACTIVITY/);
  assert.match(charts, /CONTEXT PRESSURE/);
  assert.match(charts, /TOOL ACTIVITY/);
  assert.match(charts, /SELECTED \/ EVENTS/);

  const table = stripAnsi(renderSessionDashboard({ rows, width: 150, height: 36, mode: 'mono', viewMode: 'table' }).lines.join('\n'));
  assert.match(table, /SESSION INDEX/);
  assert.match(table, /SESSIONS/);
  assert.doesNotMatch(table, /TOKEN ACTIVITY/);
  assert.doesNotMatch(table, /TOOL ACTIVITY/);
});

test('auto view resolves from terminal geometry without changing data semantics', () => {
  assert.equal(resolveManagerViewMode('auto', 'narrow'), 'table');
  assert.equal(resolveManagerViewMode('auto', 'normal'), 'operations');
  assert.equal(resolveManagerViewMode('auto', 'wide'), 'operations');
  assert.equal(resolveManagerViewMode('auto', 'ultrawide'), 'charts');
  assert.equal(resolveManagerViewMode('operations', 'ultrawide'), 'operations');
});

test('empty and unmatched dashboard states render safely', () => {
  const empty = renderSessionDashboard({ rows: [], width: 80, height: 24, mode: 'mono' });
  assert.ok(empty.lines.every((line) => cellWidth(line) <= 80));
  assert.match(stripAnsi(empty.lines.join('\n')), /No sessions match current query/);

  const unmatched = renderSessionDashboard({ rows, search: 'does-not-exist', width: 100, height: 28, mode: 'mono' });
  assert.equal(unmatched.model.rows.length, 0);
  assert.match(stripAnsi(unmatched.lines.join('\n')), /No sessions match current query/);
});
