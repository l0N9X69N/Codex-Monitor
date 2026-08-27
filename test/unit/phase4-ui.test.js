import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_VERSION, normalizeConfig, configForPreset, applyRuntimeOverrides } from '../../src/config/schema.js';
import { cellWidth, stripAnsi, truncateCells } from '../../src/ui/cell-width.js';
import { layoutSections, monitorRowBudget } from '../../src/ui/layout.js';
import { assertNoWrap, buildLiveFrame } from '../../src/ui/live-renderer.js';
import { createDemoState } from '../../src/ui/demo.js';

const NOW = Date.parse('2026-08-25T00:00:00Z');

function frame({ width = 100, height = 30, authMode = 'login', preset = 'recommended', theme = 'color', stateKind = 'idle' } = {}) {
  const config = normalizeConfig({ ...configForPreset(preset), theme });
  const state = createDemoState(stateKind, { authMode, nowMs: NOW });
  return buildLiveFrame({ state, config, width, height, nowMs: NOW, cwd: 'C:/repo/Codex-Monitor', health: 'OK' });
}

test('config schema preserves valid header choices and removes legacy Live tabs', () => {
  const config = normalizeConfig({
    preset: 'custom',
    header: ['activity', 'model', 'reasoning', 'project', 'git', 'auth'],
    tabs: []
  });
  assert.deepEqual(config.header, ['activity', 'model', 'reasoning', 'project', 'git', 'auth']);
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'tabs'), false);
  assert.equal(config.configVersion, CONFIG_VERSION);
});

test('runtime preset/theme/lang overrides are invocation-local transformations', () => {
  const base = normalizeConfig(configForPreset('recommended'));
  const next = applyRuntimeOverrides(base, { preset: 'compact', theme: 'matrix', language: 'en' });
  assert.equal(base.preset, 'recommended');
  assert.equal(base.theme, 'color');
  assert.equal(next.preset, 'compact');
  assert.equal(next.theme, 'matrix');
  assert.equal(next.language, 'en');
});

test('terminal cell width handles Vietnamese, emoji and ANSI', () => {
  assert.equal(cellWidth('Tiếng Việt'), 10);
  assert.equal(cellWidth('A🙂B'), 4);
  assert.equal(cellWidth('\x1b[31mERROR\x1b[0m'), 5);
  assert.ok(cellWidth(truncateCells('Tiếng Việt rất dài', 8)) <= 8);
});

test('height budget follows current live monitor thresholds', () => {
  assert.equal(monitorRowBudget(40), 9);
  assert.equal(monitorRowBudget(30), 7);
  assert.equal(monitorRowBudget(20), 5);
  assert.equal(monitorRowBudget(12), 3);
});

test('responsive lane engine increases lanes with width but honors row budget', () => {
  const sections = [
    { id: 'a', minWidth: 20, preferredWidth: 30, estimatedHeight: 2, priority: 3 },
    { id: 'b', minWidth: 20, preferredWidth: 30, estimatedHeight: 2, priority: 2 },
    { id: 'c', minWidth: 20, preferredWidth: 30, estimatedHeight: 2, priority: 1 }
  ];
  const narrow = layoutSections(sections, { width: 42, height: 24, maxRows: 3 });
  const wide = layoutSections(sections, { width: 110, height: 24, maxRows: 3 });
  assert.equal(narrow.laneCount, 1);
  assert.ok(wide.laneCount >= 2);
  assert.ok(narrow.lanes.every((lane) => lane.rows <= 3));
  assert.ok(wide.lanes.every((lane) => lane.rows <= 3));
});

test('responsive header stays bounded without mutating configured header choices', () => {
  const config = normalizeConfig({
    ...configForPreset('custom'),
    header: ['activity', 'model', 'reasoning', 'project', 'git', 'auth', 'health', 'session-age']
  });
  const state = createDemoState('tool', { authMode: 'login', nowMs: NOW });
  for (const width of [34, 60, 100, 180]) {
    const result = buildLiveFrame({ state, config, width, height: 30, nowMs: NOW, cwd: 'C:/repo/Codex-Monitor' });
    assert.ok(result.lines.every((line) => cellWidth(line) <= width));
  }
  assert.equal(config.header.length, 8);
});

test('width/height matrix never wraps or exceeds monitor row budget', () => {
  for (const width of [28, 40, 60, 80, 120, 180]) {
    for (const height of [12, 18, 24, 35, 50]) {
      const result = frame({ width, height });
      assert.equal(assertNoWrap(result, width), true, `${width}x${height} wraps`);
      assert.ok(result.lines.length <= monitorRowBudget(height), `${width}x${height} exceeds row budget`);
    }
  }
});

test('Login shows quota while API does not show Login quota', () => {
  const login = stripAnsi(frame({ authMode: 'login', width: 120, height: 35 }).lines.join('\n'));
  const api = stripAnsi(frame({ authMode: 'api', width: 120, height: 35 }).lines.join('\n'));
  assert.match(login, /5H/);
  assert.match(login, /WEEK/);
  assert.doesNotMatch(api, /5H/);
  assert.doesNotMatch(api, /WEEK/);
});

test('unknown system telemetry renders as -- rather than zero', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = createDemoState('idle', { authMode: 'login', nowMs: NOW });
  state.system.cpuPercent.value = null;
  state.system.memoryBytes.value = null;
  const text = stripAnsi(buildLiveFrame({ state, config, width: 180, height: 35, nowMs: NOW }).lines.join('\n'));
  assert.match(text, /SYS\s+--\/--|SYSTEM CPU -- · RAM --/);
  assert.doesNotMatch(text, /RAM 0(?:\s|$)/);
});

test('Color Mono Matrix preserve textual semantics', () => {
  const normalized = ['color', 'mono', 'matrix'].map((theme) => stripAnsi(frame({ theme, width: 120, height: 35, stateKind: 'tool' }).lines.join('\n')));
  assert.equal(normalized[0], normalized[1]);
  assert.equal(normalized[1], normalized[2]);
});

test('all activity demo states keep canonical labels', () => {
  for (const stateKind of ['idle', 'thinking', 'tool', 'approval', 'error']) {
    const text = stripAnsi(frame({ stateKind, width: 90, height: 30 }).lines.join('\n'));
    assert.match(text, new RegExp(stateKind.toUpperCase()));
  }
});
