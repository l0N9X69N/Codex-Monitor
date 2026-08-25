import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { buildLiveFrame, assertNoWrap } from '../../src/ui/live-renderer.js';
import { stripAnsi, cellWidth } from '../../src/ui/cell-width.js';
import { monitorRowBudget } from '../../src/ui/layout.js';
import { LiveDataRuntime } from '../../src/runtime/live-data.js';
import { createCurrentRunState } from '../../src/core/state.js';

const NOW = Date.parse('2026-08-25T00:00:00Z');

test('legacy config tabs are ignored and schema migrates to passive v2', () => {
  const config = normalizeConfig({
    configVersion: 1,
    preset: 'full',
    tabs: ['overview', 'performance', 'processes', 'tools'],
    header: ['activity', 'model', 'reasoning', 'project', 'git']
  });
  assert.equal(config.configVersion, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'tabs'), false);
  assert.equal(config.header.length, 4);
});

test('wide Full restores framed v1-quality dashboard hierarchy', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = createDemoState('tool', { authMode: 'login', nowMs: NOW });
  const frame = buildLiveFrame({ state, config, width: 160, height: 40, nowMs: NOW, projectName: 'Codex Monitor' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.lines.length, 7);
  assert.match(text, /CODEX MONITOR · FULL/);
  assert.match(text, /CONTEXT/);
  assert.match(text, /USAGE · LOGIN/);
  assert.match(text, /SESSION/);
  assert.match(text, /CURRENT ACTIVITY/);
  assert.match(text, /TOOL/);
  assert.match(text, /╭/);
  assert.match(text, /╰/);
  assert.equal(assertNoWrap(frame, 160), true);
  assert.equal(frame.semantic.interactive, false);
});

test('passive HUD never renders old Live navigation chrome', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = createDemoState('idle', { authMode: 'login', nowMs: NOW });
  const text = stripAnsi(buildLiveFrame({ state, config, width: 160, height: 40, nowMs: NOW }).lines.join('\n'));
  assert.doesNotMatch(text, /\[overview\]|performance\s+processes|Alt\+|F4 History|Ctrl\+G/i);
});

test('API mode does not display Login quota in framed or compact layouts', () => {
  for (const [width, height] of [[160, 40], [90, 24], [56, 18]]) {
    const config = normalizeConfig(configForPreset(width >= 120 ? 'full' : 'recommended'));
    const state = createDemoState('idle', { authMode: 'api', nowMs: NOW });
    const text = stripAnsi(buildLiveFrame({ state, config, width, height, nowMs: NOW }).lines.join('\n'));
    assert.doesNotMatch(text, /\b5H\b/);
    assert.doesNotMatch(text, /\bWEEK\b/);
  }
});

test('responsive passive HUD stays inside terminal cell and row budgets', () => {
  for (const width of [28, 40, 60, 80, 104, 120, 160, 200]) {
    for (const height of [10, 18, 24, 35, 50]) {
      const config = normalizeConfig(configForPreset('full'));
      const state = createDemoState('idle', { authMode: 'login', nowMs: NOW });
      const frame = buildLiveFrame({ state, config, width, height, nowMs: NOW });
      assert.equal(assertNoWrap(frame, width), true, `${width}x${height} wraps`);
      assert.ok(frame.lines.length <= monitorRowBudget(height), `${width}x${height} exceeds row budget`);
      assert.ok(frame.lines.every((line) => cellWidth(line) <= width));
    }
  }
});

test('system collector demand exists only when SYSTEM is actually displayed', () => {
  const adapter = { paths: () => ({ sessions: null }) };
  const state = createCurrentRunState({ startedAtMs: NOW });
  const recommended = normalizeConfig(configForPreset('recommended'));
  const full = normalizeConfig(configForPreset('full'));
  const recommendedRuntime = new LiveDataRuntime({ state, config: recommended, adapter, now: () => NOW });
  const fullRuntime = new LiveDataRuntime({ state, config: full, adapter, now: () => NOW });
  assert.equal(recommendedRuntime.graph().hasCollector('system'), false);
  assert.equal(fullRuntime.graph().hasCollector('system'), true);
  assert.equal(recommendedRuntime.graph().hasCollector('performance'), false);
  assert.equal(recommendedRuntime.graph().hasCollector('processes'), false);
  assert.equal(fullRuntime.graph().hasCollector('performance'), false);
  assert.equal(fullRuntime.graph().hasCollector('processes'), false);
});
