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

test('legacy config tabs are ignored and passive v2 preserves valid header choices beyond the recommended four', () => {
  const config = normalizeConfig({
    configVersion: 1,
    preset: 'custom',
    tabs: ['overview', 'performance', 'processes', 'tools'],
    header: ['activity', 'model', 'reasoning', 'project', 'git', 'auth']
  });
  assert.equal(config.configVersion, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'tabs'), false);
  assert.deepEqual(config.header, ['activity', 'model', 'reasoning', 'project', 'git', 'auth']);
});

test('wide Full mirrors full-monitor-v2 visual hierarchy without restoring its old input model', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = createDemoState('tool', { authMode: 'login', nowMs: NOW });
  const frame = buildLiveFrame({ state, config, width: 160, height: 40, nowMs: NOW, projectName: 'Codex Monitor' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.lines.length, 9);
  assert.equal(frame.semantic.visual, 'full-monitor-v2-grid');
  assert.equal(frame.semantic.interactive, false);
  assert.match(text, /CODEX MONITOR · FULL/);
  assert.match(text, /main\*/);
  assert.match(text, /3 files/);
  assert.match(text, /Δ\+10 −1/);
  assert.match(text, /↑2 ↓1/);
  assert.match(text, /CONTEXT/);
  assert.match(text, /USAGE · LOGIN/);
  assert.match(text, /SESSION/);
  assert.match(text, /CURRENT ACTIVITY/);
  assert.match(text, /CACHE/);
  assert.match(text, /LEFT/);
  assert.match(text, /CMP/);
  assert.match(text, /SINCE/);
  assert.match(text, /5H/);
  assert.match(text, /WEEK/);
  assert.match(text, /\bturns\b/i);
  assert.match(text, /elapsed/);
  assert.match(text, /thread/);
  assert.match(text, /source/);
  assert.match(text, /approval/);
  assert.match(text, /retry/);
  assert.match(text, /err/);
  assert.match(text, /╭/);
  assert.match(text, /╰/);
  assert.equal(assertNoWrap(frame, 160), true);
});

test('passive HUD never renders old Live navigation chrome', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = createDemoState('idle', { authMode: 'login', nowMs: NOW });
  const text = stripAnsi(buildLiveFrame({ state, config, width: 160, height: 40, nowMs: NOW }).lines.join('\n'));
  assert.doesNotMatch(text, /\[overview\]|performance\s+processes|Alt\+|F4 History|Ctrl\+G/i);
});

test('API mode keeps full-monitor-v2 card structure but never displays Login quota', () => {
  for (const [width, height] of [[160, 40], [90, 24], [56, 18]]) {
    const config = normalizeConfig(configForPreset(width >= 120 ? 'full' : 'recommended'));
    const state = createDemoState('idle', { authMode: 'api', nowMs: NOW });
    const text = stripAnsi(buildLiveFrame({ state, config, width, height, nowMs: NOW }).lines.join('\n'));
    assert.doesNotMatch(text, /\b5H\b/);
    assert.doesNotMatch(text, /\bWEEK\b/);
    if (width >= 120) {
      assert.match(text, /USAGE · API/);
      assert.match(text, /MODEL/);
      assert.match(text, /ACTUAL/);
    }
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

test('Full demands only displayed System and Git collectors; heavy hidden views stay off', () => {
  const adapter = { paths: () => ({ sessions: null }) };
  const state = createCurrentRunState({ startedAtMs: NOW });
  const recommended = normalizeConfig(configForPreset('recommended'));
  const full = normalizeConfig(configForPreset('full'));
  const recommendedRuntime = new LiveDataRuntime({ state, config: recommended, adapter, now: () => NOW });
  const fullRuntime = new LiveDataRuntime({ state, config: full, adapter, now: () => NOW });
  assert.equal(recommendedRuntime.graph().hasCollector('system'), false);
  assert.equal(recommendedRuntime.graph().hasCollector('git-branch'), false);
  assert.equal(fullRuntime.graph().hasCollector('system'), true);
  assert.equal(fullRuntime.graph().hasCollector('git-branch'), true);
  assert.equal(fullRuntime.graph().hasCollector('git-diff'), true);
  assert.equal(fullRuntime.graph().hasCollector('git-ahead-behind'), true);
  assert.equal(recommendedRuntime.graph().hasCollector('performance'), false);
  assert.equal(recommendedRuntime.graph().hasCollector('processes'), false);
  assert.equal(fullRuntime.graph().hasCollector('performance'), false);
  assert.equal(fullRuntime.graph().hasCollector('processes'), false);
});

test('health header is derived from current run state rather than a dead placeholder', () => {
  const config = normalizeConfig({ ...configForPreset('custom'), header: ['health'], sections: { context: true, usage: false, session: false, activity: true, system: false } });
  const state = createDemoState('error', { authMode: 'login', nowMs: NOW });
  const text = stripAnsi(buildLiveFrame({ state, config, width: 80, height: 24, nowMs: NOW }).lines.join('\n'));
  assert.match(text, /HEALTH ERROR/);
});
