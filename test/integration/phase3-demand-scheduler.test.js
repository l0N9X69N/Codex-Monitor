import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemandGraph } from '../../src/core/demand-graph.js';
import { CollectorRegistry } from '../../src/collectors/registry.js';
import { CollectorManager } from '../../src/collectors/manager.js';
import { createTestInstrumentation } from '../../src/core/instrumentation.js';

function baseConfig(activeTab) {
  return {
    header: ['activity', 'model'],
    enabledTabs: ['overview', 'performance', 'processes'],
    activeTab,
    sections: { context: true, usage: true, session: true, activity: true }
  };
}

test('inactive heavy collectors execute zero times while overview is active', async () => {
  const counts = { session: 0, performance: 0, processes: 0 };
  const registry = new CollectorRegistry();
  for (const id of Object.keys(counts)) registry.register({ id, run: async () => { counts[id] += 1; } });
  const instrumentation = createTestInstrumentation();
  const manager = new CollectorManager({ registry, instrumentation, now: () => 1 });

  manager.syncPlan(buildDemandGraph(baseConfig('overview')));
  await manager.runDue(1);

  assert.equal(counts.session, 1);
  assert.equal(counts.performance, 0);
  assert.equal(counts.processes, 0);
  assert.equal(instrumentation.snapshot().collectors.performance, undefined);
});

test('heavy sampler starts on Performance and stops after leaving the view', async () => {
  const counts = { session: 0, performance: 0 };
  const registry = new CollectorRegistry();
  registry.register({ id: 'session', ttlMs: 0, minIntervalMs: 0, run: async () => { counts.session += 1; } });
  registry.register({ id: 'performance', ttlMs: 0, minIntervalMs: 0, run: async () => { counts.performance += 1; } });
  const manager = new CollectorManager({ registry, now: () => 1 });

  manager.syncPlan(buildDemandGraph(baseConfig('performance')));
  await manager.runDue(1);
  assert.equal(counts.performance, 1);

  manager.syncPlan(buildDemandGraph(baseConfig('overview')));
  await manager.runDue(2);
  assert.equal(counts.performance, 1);
  assert.equal(manager.stateFor('performance').enabled, false);
});
