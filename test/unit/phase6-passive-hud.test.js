import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { buildLiveFrame, assertNoWrap } from '../../src/ui/live-renderer.js';
import { buildLiveFrame as buildResponsiveLiveFrame, MIN_SPARKLINE_SAMPLES, progressBar, sparkline } from '../../src/ui/live-renderer-responsive.js';
import { stripAnsi, cellWidth } from '../../src/ui/cell-width.js';
import { monitorRowBudget } from '../../src/ui/layout.js';
import { LiveDataRuntime } from '../../src/runtime/live-data.js';
import { createCurrentRunState } from '../../src/core/state.js';
import { setMetric } from '../../src/core/normalized-state.js';
import { PROVENANCE } from '../../src/core/provenance.js';

const NOW = Date.parse('2026-08-25T00:00:00Z');

function setLocal(target, key, value, evidence = 'phase6-test') {
  setMetric(target, key, value, { source: PROVENANCE.LOCAL, observedAtMs: NOW, evidence });
}

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
  setLocal(state.git, 'branch', 'main', 'git local branch');
  setLocal(state.git, 'dirty', true, 'git status --porcelain');
  setLocal(state.git, 'diff', {
    changedFiles: 3,
    added: 0,
    modified: 1,
    deleted: 1,
    renamed: 0,
    untracked: 1,
    conflicted: 0,
    additions: 10,
    deletions: 1
  }, 'git diff');
  setLocal(state.git, 'aheadBehind', { ahead: 2, behind: 1 }, 'git upstream');
  setMetric(state.compaction, 'turnsSinceCompact', 2, { source: PROVENANCE.DERIVED, observedAtMs: NOW, evidence: 'turnCount-lastCompactTurn' });
  const frame = buildLiveFrame({ state, config, width: 200, height: 40, nowMs: NOW, projectName: 'Codex Monitor' });
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.lines.length, 9);
  assert.equal(frame.semantic.visual, 'full-monitor-v2-grid');
  assert.equal(frame.semantic.interactive, false);
  assert.match(text, /CODEX MONITOR · FULL/);
  assert.match(text, /main\*/);
  assert.match(text, /M1/);
  assert.match(text, /D1/);
  assert.match(text, /\?1/);
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
  assert.equal(assertNoWrap(frame, 200), true);
});

test('long Git branch keeps file status before optional line delta when header space is constrained', () => {
  const config = normalizeConfig({ ...configForPreset('custom'), header: ['git'] });
  const state = createDemoState('idle', { authMode: 'login', nowMs: NOW });
  setLocal(state.git, 'branch', 'v1-rearchitecture');
  setLocal(state.git, 'dirty', true);
  setLocal(state.git, 'diff', {
    changedFiles: 1,
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    untracked: 1,
    conflicted: 0,
    additions: 0,
    deletions: 0
  });
  const text = stripAnsi(buildLiveFrame({ state, config, width: 42, height: 20, nowMs: NOW }).lines[0]);
  assert.match(text, /v1-rearchitecture\*/);
  assert.match(text, /\?1/);
  assert.match(text, /1 file/);
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

test('ultrawide graphs progressively appear only when useful data exists', () => {
  const config = normalizeConfig(configForPreset('full'));
  const state = createDemoState('idle', { authMode: 'login', nowMs: NOW });
  setLocal(state.system, 'cpuPercent', 30);
  setLocal(state.system, 'memoryBytes', 12_000_000_000);
  setLocal(state.system, 'totalMemoryBytes', 16_000_000_000);
  setLocal(state.system, 'freeMemoryBytes', 4_000_000_000);
  setLocal(state.system, 'samples', [
    { cpuPercent: 10, memoryBytes: 10_000_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 20, memoryBytes: 11_000_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 15, memoryBytes: 11_500_000_000, totalMemoryBytes: 16_000_000_000 }
  ]);
  const waiting = stripAnsi(buildResponsiveLiveFrame({ state, config, width: 220, height: 40, nowMs: NOW }).lines.join('\n'));
  assert.doesNotMatch(waiting, /[▁▂▃▄▅▆▇█]{4,}/);

  setLocal(state.system, 'samples', [
    { cpuPercent: 10, memoryBytes: 10_000_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 20, memoryBytes: 11_000_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 15, memoryBytes: 11_500_000_000, totalMemoryBytes: 16_000_000_000 },
    { cpuPercent: 30, memoryBytes: 12_000_000_000, totalMemoryBytes: 16_000_000_000 }
  ]);
  const readyFrame = buildResponsiveLiveFrame({ state, config, width: 220, height: 40, nowMs: NOW });
  const ready = stripAnsi(readyFrame.lines.join('\n'));
  assert.equal(readyFrame.semantic.progressiveGraphs, true);
  assert.match(ready, /[▁▂▃▄▅▆▇█]{4,}/);
  assert.match(ready, /█+░+/);
  assert.equal(readyFrame.lines.every((line) => cellWidth(line) <= 220), true);
  assert.equal(MIN_SPARKLINE_SAMPLES, 4);
  assert.equal(sparkline([10, 20, 15], 12), null);
  assert.ok(sparkline([10, 20, 15, 30], 12));
  assert.ok(progressBar(25, 8));
});
