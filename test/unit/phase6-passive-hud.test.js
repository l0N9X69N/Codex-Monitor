import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import {
  buildLiveFrame,
  assertNoWrap,
  CARD_REPRESENTATION,
  MIN_SPARKLINE_SAMPLES,
  columnCountFor,
  progressBar,
  sparkline
} from '../../src/ui/live-renderer-responsive.js';
import { stripAnsi, cellWidth } from '../../src/ui/cell-width.js';
import { LiveDataRuntime } from '../../src/runtime/live-data.js';
import { createCurrentRunState } from '../../src/core/state.js';
import { setMetric } from '../../src/core/normalized-state.js';
import { PROVENANCE } from '../../src/core/provenance.js';

const NOW = Date.parse('2026-08-25T00:00:00Z');

function setLocal(target, key, value, evidence = 'phase6-test') {
  setMetric(target, key, value, { source: PROVENANCE.LOCAL, observedAtMs: NOW, evidence });
}

function textOf(frame) {
  return stripAnsi(frame.lines.join('\n'));
}

function fullState(authMode = 'login') {
  const state = createDemoState('idle', { authMode, nowMs: NOW });
  setLocal(state.system, 'cpuPercent', 30);
  setLocal(state.system, 'memoryBytes', 12_000_000_000);
  setLocal(state.system, 'totalMemoryBytes', 16_000_000_000);
  setLocal(state.system, 'freeMemoryBytes', 4_000_000_000);
  return state;
}

test('three public presets plus custom remain the user-facing configuration model', () => {
  for (const preset of ['compact', 'recommended', 'full', 'custom']) {
    assert.equal(normalizeConfig({ preset }).preset, preset);
  }
  assert.equal(normalizeConfig({ preset: 'minimal' }).preset, 'recommended');
});

test('responsive card grid packs enabled cards from five columns down to one', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = fullState('login');
  const cases = [
    [220, 5],
    [180, 5],
    [160, 4],
    [130, 3],
    [100, 2],
    [70, 2],
    [60, 1],
    [40, 1]
  ];

  for (const [width, columns] of cases) {
    const frame = buildLiveFrame({ state, config, width, height: 50, nowMs: NOW, projectName: 'Codex Monitor' });
    const text = textOf(frame);
    assert.equal(frame.semantic.visual, 'responsive-card-grid-v3');
    assert.equal(frame.semantic.columns, columns, `${width} cells should use ${columns} columns`);
    assert.equal(frame.semantic.cardCount, 5);
    assert.match(text, /CONTEXT/);
    assert.match(text, /USAGE · LOGIN/);
    assert.match(text, /SESSION/);
    assert.match(text, /CURRENT ACTIVITY/);
    assert.match(text, /SYSTEM/);
    assert.equal(assertNoWrap(frame, width), true, `${width} cells wraps`);
    assert.ok(frame.lines.every((line) => cellWidth(line) <= width));
  }

  assert.equal(columnCountFor(220, 5), 5);
  assert.equal(columnCountFor(60, 5), 1);
});

test('narrow full layout preserves card frames and degrades to minimal representation', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = fullState('login');
  const frame = buildLiveFrame({ state, config, width: 60, height: 45, nowMs: NOW });
  const text = textOf(frame);

  assert.equal(frame.semantic.columns, 1);
  assert.equal(frame.semantic.representations.context, CARD_REPRESENTATION.MINIMAL);
  assert.equal(frame.semantic.representations.usage, CARD_REPRESENTATION.MINIMAL);
  assert.equal(frame.semantic.representations.session, CARD_REPRESENTATION.MINIMAL);
  assert.equal(frame.semantic.representations.activity, CARD_REPRESENTATION.MINIMAL);
  assert.equal(frame.semantic.representations.system, CARD_REPRESENTATION.MINIMAL);
  assert.match(text, /│ CONTEXT ·/);
  assert.match(text, /│ USAGE · LOGIN ·/);
  assert.match(text, /│ SESSION ·/);
  assert.match(text, /│ CURRENT ACTIVITY ·/);
  assert.match(text, /│ SYSTEM ·/);
  assert.match(text, /╭/);
  assert.match(text, /╰/);
});

test('custom config removes only disabled cards and redistributes the remaining grid', () => {
  const config = normalizeConfig({
    ...configForPreset('custom'),
    sections: { context: true, usage: true, session: false, activity: true, system: false },
    metrics: { context: true, usage: true, activity: true, session: false, system: false },
    header: ['activity', 'model', 'project']
  });
  const state = fullState('login');
  const frame = buildLiveFrame({ state, config, width: 120, height: 40, nowMs: NOW });
  const text = textOf(frame);
  assert.equal(frame.semantic.cardCount, 3);
  assert.match(text, /CONTEXT/);
  assert.match(text, /USAGE · LOGIN/);
  assert.match(text, /CURRENT ACTIVITY/);
  assert.doesNotMatch(text, /\bSESSION\b/);
  assert.doesNotMatch(text, /\bSYSTEM\b/);
});

test('Login usage gets thin quota bars when width permits and keeps essential quota values when compact', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = fullState('login');

  const wide = textOf(buildLiveFrame({ state, config, width: 220, height: 50, nowMs: NOW }));
  assert.match(wide, /5H\s+[━─]{6,}\s+\d+% left/);
  assert.match(wide, /WEEK\s+[━─]{6,}\s+\d+% left/);

  const narrow = textOf(buildLiveFrame({ state, config, width: 60, height: 45, nowMs: NOW }));
  assert.match(narrow, /5H \d+%/);
  assert.match(narrow, /W \d+%/);
  assert.doesNotMatch(narrow, /WEEK\s+[━─]{6,}/);
});

test('API key mode never displays Login quota and keeps model plus token usage across representations', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = fullState('api');

  for (const [width, height] of [[220, 50], [140, 40], [80, 40], [60, 45]]) {
    const frame = buildLiveFrame({ state, config, width, height, nowMs: NOW });
    const text = textOf(frame);
    assert.doesNotMatch(text, /\b5H\b/);
    assert.doesNotMatch(text, /\bWEEK\b/);
    assert.match(text, /USAGE · API/);
    assert.match(text, /IN\s+/);
    assert.match(text, /OUT\s+/);
    assert.match(text, /gpt-/i);
    assert.equal(assertNoWrap(frame, width), true);
  }
});

test('system low-profile sparkline appears only after enough samples and never replaces essential CPU/RAM values', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = fullState('login');
  setLocal(state.system, 'samples', [
    { cpuPercent: 10, memoryBytes: 10_000_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 20, memoryBytes: 11_000_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 15, memoryBytes: 11_500_000_000, totalMemoryBytes: 16_000_000_000 }
  ]);

  const waiting = textOf(buildLiveFrame({ state, config, width: 220, height: 50, nowMs: NOW }));
  assert.match(waiting, /CPU 30%/);
  assert.match(waiting, /RAM 75%/);
  assert.doesNotMatch(waiting, /CPU 30%.*[▁▂▃▄]{4,}/);

  setLocal(state.system, 'samples', [
    { cpuPercent: 10, memoryBytes: 10_000_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 20, memoryBytes: 11_000_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 15, memoryBytes: 11_500_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 30, memoryBytes: 12_000_000_000, totalMemoryBytes: 16_000_000_000 }
  ]);
  const ready = textOf(buildLiveFrame({ state, config, width: 220, height: 50, nowMs: NOW }));
  assert.match(ready, /CPU 30%\s{2}[▁▂▃▄]{4,}/);
  assert.match(ready, /RAM 75%\s{2}[▁▂▃▄]{4,}/);
  assert.equal(MIN_SPARKLINE_SAMPLES, 4);
  assert.equal(sparkline([10, 20, 15], 12), null);
  assert.ok(sparkline([10, 20, 15, 30], 12));
  assert.match(progressBar(25, 8), /^[━─]{8}$/);
});

test('all supported responsive widths remain bounded and keep Codex priority on realistic terminal heights', () => {
  const config = normalizeConfig(configForPreset('full'));
  for (const width of [40, 50, 60, 70, 80, 100, 120, 140, 160, 180, 200, 240, 300]) {
    for (const height of [24, 35, 45, 60]) {
      const frame = buildLiveFrame({ state: fullState('login'), config, width, height, nowMs: NOW });
      assert.equal(assertNoWrap(frame, width), true, `${width}x${height} wraps`);
      assert.ok(frame.lines.every((line) => cellWidth(line) <= width));
      assert.ok(frame.lines.length <= Math.max(3, height - 8), `${width}x${height} consumes Codex viewport`);
    }
  }
});

test('Full demands displayed System and Git collectors without enabling heavy hidden collectors', () => {
  const adapter = { paths: () => ({ sessions: null }) };
  const state = createCurrentRunState({ startedAtMs: NOW });
  const recommended = normalizeConfig(configForPreset('recommended'));
  const full = normalizeConfig(configForPreset('full'));
  const recommendedRuntime = new LiveDataRuntime({ state, config: recommended, adapter, now: () => NOW });
  const fullRuntime = new LiveDataRuntime({ state, config: full, adapter, now: () => NOW });
  assert.equal(recommendedRuntime.graph().hasCollector('system'), false);
  assert.equal(fullRuntime.graph().hasCollector('system'), true);
  assert.equal(fullRuntime.graph().hasCollector('git-branch'), true);
  assert.equal(fullRuntime.graph().hasCollector('git-diff'), true);
  assert.equal(fullRuntime.graph().hasCollector('git-ahead-behind'), true);
  assert.equal(fullRuntime.graph().hasCollector('performance'), false);
  assert.equal(fullRuntime.graph().hasCollector('processes'), false);
});

test('health header remains derived from current state inside the card renderer', () => {
  const config = normalizeConfig({
    ...configForPreset('custom'),
    header: ['health'],
    sections: { context: true, usage: false, session: false, activity: true, system: false }
  });
  const state = createDemoState('error', { authMode: 'login', nowMs: NOW });
  const text = textOf(buildLiveFrame({ state, config, width: 80, height: 30, nowMs: NOW }));
  assert.match(text, /HEALTH ERROR/);
});