import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDemandGraph } from '../../src/core/demand-graph.js';
import { createNormalizedMonitorState, setMetric } from '../../src/core/normalized-state.js';
import { applyNormalizedEvent } from '../../src/core/reducer.js';
import { PROVENANCE } from '../../src/core/provenance.js';
import { scanResourceMetadata, processDescendants } from '../../src/collectors/live.js';
import { renderLiveView } from '../../src/ui/live-views.js';

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p6-')); }

test('heavy collectors are demanded only by their active Live view', () => {
  const base = { header: ['activity'], enabledTabs: ['overview', 'performance', 'processes', 'resources'], sections: {}, enabledMetrics: null };
  const overview = buildDemandGraph({ ...base, activeTab: 'overview' });
  const performance = buildDemandGraph({ ...base, activeTab: 'performance' });
  const processes = buildDemandGraph({ ...base, activeTab: 'processes' });
  const resources = buildDemandGraph({ ...base, activeTab: 'resources' });
  assert.equal(overview.hasCollector('performance'), false);
  assert.equal(overview.hasCollector('processes'), false);
  assert.equal(overview.hasCollector('resources'), false);
  assert.equal(performance.hasCollector('performance'), true);
  assert.equal(performance.hasCollector('processes'), false);
  assert.equal(processes.hasCollector('processes'), true);
  assert.equal(resources.hasCollector('resources'), true);
  assert.equal(resources.hasCollector('disk'), true);
});

test('Resources scanner is metadata-only and never needs file bodies', () => {
  const cwd = tempDir();
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), 'SECRET_BODY_MUST_NOT_BE_READ');
  fs.writeFileSync(path.join(cwd, '.mcp.json'), '{"token":"SECRET"}');
  fs.mkdirSync(path.join(cwd, '.codex', 'skills', 'safe-skill'), { recursive: true });
  let readCalls = 0;
  const fsRef = {
    statSync: fs.statSync.bind(fs),
    readdirSync: fs.readdirSync.bind(fs),
    readFileSync() { readCalls += 1; throw new Error('body read forbidden'); }
  };
  const result = scanResourceMetadata(cwd, { fsRef });
  assert.deepEqual(result.instructions, ['AGENTS.md']);
  assert.deepEqual(result.mcp, ['.mcp.json']);
  assert.ok(result.skills.some((item) => item.includes('safe-skill')));
  assert.equal(readCalls, 0);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  fs.rmSync(cwd, { recursive: true, force: true });
});

test('Tools aggregate only reducer events supplied for the current run', () => {
  const state = createNormalizedMonitorState({ startedAtMs: 1000 });
  applyNormalizedEvent(state, { kind: 'turn-start', atMs: 1100, turnId: 't1' }, { source: PROVENANCE.OFFICIAL_CURRENT });
  applyNormalizedEvent(state, { kind: 'tool-start', atMs: 1200, callId: 'c1', tool: 'shell' }, { source: PROVENANCE.OFFICIAL_CURRENT });
  applyNormalizedEvent(state, { kind: 'tool-end', atMs: 1300, callId: 'c1' }, { source: PROVENANCE.OFFICIAL_CURRENT });
  assert.equal(state.tools.counts.value.shell, 1);
  assert.equal(state.tools.current.value, null);
  assert.equal(state.tools.last.value.name, 'shell');
  assert.equal(state.tools.last.value.ok, true);
  assert.equal(state.tools.recent.value.length, 1);
});

test('API Usage view never displays Login quota and preserves unknown cache ratio', () => {
  const state = createNormalizedMonitorState();
  setMetric(state.auth, 'mode', 'api', { source: PROVENANCE.LOCAL });
  setMetric(state.quota, 'fiveHour', { remainingPercent: 80 }, { source: PROVENANCE.LOCAL });
  const text = renderLiveView('usage', state, { width: 140, maxRows: 10 }).join('\n');
  assert.doesNotMatch(text, /5H|WEEK/);
  assert.match(text, /cache --/);
});

test('process tree is scoped to Codex root descendants', () => {
  const tree = [
    { pid: 10, ppid: 1, name: 'codex' },
    { pid: 11, ppid: 10, name: 'node' },
    { pid: 12, ppid: 11, name: 'git' },
    { pid: 99, ppid: 1, name: 'other' }
  ];
  assert.deepEqual(processDescendants(tree, 10).map((item) => item.pid), [10, 11, 12]);
});
