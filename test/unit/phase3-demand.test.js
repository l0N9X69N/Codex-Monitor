import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemandGraph } from '../../src/core/demand-graph.js';

function config(overrides = {}) {
  return {
    header: ['activity', 'model'],
    enabledTabs: ['overview', 'performance', 'processes', 'tools', 'resources'],
    activeTab: 'overview',
    sections: { context: true, usage: true, session: true, activity: true, system: false },
    ...overrides
  };
}

test('metric OFF means its collector demand is OFF', () => {
  const graph = buildDemandGraph(config({
    enabledMetrics: { activity: true, model: false, context: true, usage: true, session: true }
  }));
  assert.equal(graph.hasMetric('model'), false);
  assert.equal(graph.hasMetric('activity'), true);
});

test('enabled but inactive heavy tabs do not demand continuous collectors', () => {
  const graph = buildDemandGraph(config({ activeTab: 'overview' }));
  assert.equal(graph.hasCollector('performance'), false);
  assert.equal(graph.hasCollector('processes'), false);
});

test('Performance active enables sampler and leaving view disables it', () => {
  const active = buildDemandGraph(config({ activeTab: 'performance' }));
  assert.equal(active.hasCollector('performance'), true);
  const inactive = buildDemandGraph(config({ activeTab: 'overview' }));
  assert.equal(inactive.hasCollector('performance'), false);
});

test('Git branch-only does not request diff or ahead-behind collectors', () => {
  const graph = buildDemandGraph(config({ header: ['git'], git: { diffStats: false, aheadBehind: false } }));
  assert.equal(graph.hasCollector('git-branch'), true);
  assert.equal(graph.hasCollector('git-diff'), false);
  assert.equal(graph.hasCollector('git-ahead-behind'), false);
});

test('Git expensive details are requested only when configured', () => {
  const graph = buildDemandGraph(config({ header: ['git'], git: { diffStats: true, aheadBehind: true } }));
  assert.equal(graph.hasCollector('git-branch'), true);
  assert.equal(graph.hasCollector('git-diff'), true);
  assert.equal(graph.hasCollector('git-ahead-behind'), true);
});
