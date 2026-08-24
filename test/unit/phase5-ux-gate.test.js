import test from 'node:test';
import assert from 'node:assert/strict';
import { configForPreset, normalizeConfig } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { buildLiveFrame } from '../../src/ui/live-renderer.js';
import { laneCountFor, laneThresholds, layoutSections } from '../../src/ui/layout.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

const NOW = Date.parse('2026-08-25T00:00:00Z');
const sections = [
  { id: 'context', minWidth: 22, preferredWidth: 34, estimatedHeight: 2, priority: 100 },
  { id: 'quota', minWidth: 26, preferredWidth: 42, estimatedHeight: 2, priority: 98 },
  { id: 'activity', minWidth: 20, preferredWidth: 30, estimatedHeight: 1, priority: 95 },
  { id: 'usage', minWidth: 28, preferredWidth: 42, estimatedHeight: 2, priority: 90 }
];

test('lane hysteresis prevents threshold jitter from flipping layout every cell', () => {
  const { two } = laneThresholds(sections);
  const margin = 4;
  let laneCount = 1;
  for (const width of [two - 1, two, two + 1, two + 2, two + 3]) {
    laneCount = laneCountFor(width, sections, { previousLaneCount: laneCount, hysteresisCells: margin });
    assert.equal(laneCount, 1);
  }
  laneCount = laneCountFor(two + margin, sections, { previousLaneCount: laneCount, hysteresisCells: margin });
  assert.equal(laneCount, 2);
  for (const width of [two + 2, two + 1, two, two - 1, two - 2, two - 3]) {
    laneCount = laneCountFor(width, sections, { previousLaneCount: laneCount, hysteresisCells: margin });
    assert.equal(laneCount, 2);
  }
  laneCount = laneCountFor(two - margin - 1, sections, { previousLaneCount: laneCount, hysteresisCells: margin });
  assert.equal(laneCount, 1);
});

test('wide -> narrow -> wide sequence remains bounded and recovers lane density', () => {
  let previousLaneCount = null;
  const seen = [];
  for (const width of [160, 120, 90, 72, 56, 40, 56, 72, 90, 120, 160]) {
    const layout = layoutSections(sections, { width, height: 35, maxRows: 5, previousLaneCount, hysteresisCells: 4 });
    previousLaneCount = layout.laneCount;
    seen.push(layout.laneCount);
    assert.ok(layout.lanes.every((lane) => lane.width > 0 && lane.rows <= 5));
  }
  assert.equal(seen[0], 3);
  assert.equal(Math.min(...seen), 1);
  assert.equal(seen.at(-1), 3);
});

test('recommended UX hierarchy keeps activity/navigation visible and context/quota ahead of secondary labels', () => {
  const config = normalizeConfig(configForPreset('recommended'));
  const state = createDemoState('tool', { authMode: 'login', nowMs: NOW });
  const frame = buildLiveFrame({ state, config, width: 120, height: 35, nowMs: NOW, projectName: 'Codex Monitor', health: 'OK' });
  const text = frame.lines.map(stripAnsi);
  assert.match(text[0], /TOOL/);
  assert.match(text[0], /overview/i);
  assert.ok(text.findIndex((line) => line.includes('CONTEXT')) >= 0);
  assert.ok(text.findIndex((line) => line.includes('5H')) >= 0);
  assert.ok(text.findIndex((line) => line.includes('CONTEXT')) <= text.findIndex((line) => line.includes('USAGE')));
});

test('API UX never leaks Login quota across representative dimensions', () => {
  const config = normalizeConfig(configForPreset('recommended'));
  for (const [width, height] of [[36, 18], [60, 24], [90, 24], [120, 35], [180, 50]]) {
    const state = createDemoState('idle', { authMode: 'api', nowMs: NOW });
    const frame = buildLiveFrame({ state, config, width, height, nowMs: NOW });
    const text = stripAnsi(frame.lines.join('\n'));
    assert.doesNotMatch(text, /\b5H\b/);
    assert.doesNotMatch(text, /\bWEEK\b/);
    assert.ok(frame.lines.every((line) => cellWidth(line) <= width));
  }
});
