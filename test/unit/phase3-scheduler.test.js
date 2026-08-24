import test from 'node:test';
import assert from 'node:assert/strict';
import { CollectorRegistry } from '../../src/collectors/registry.js';
import { CollectorManager } from '../../src/collectors/manager.js';
import { CentralScheduler } from '../../src/core/scheduler.js';
import { createTestInstrumentation } from '../../src/core/instrumentation.js';

function demand(...collectorIds) {
  return { collectors: collectorIds.map((collectorId) => ({ collectorId, metrics: [collectorId], consumers: ['test'] })) };
}

test('TTL prevents duplicate runs before collector becomes due again', async () => {
  let now = 1_000;
  let runs = 0;
  const registry = new CollectorRegistry();
  registry.register({ id: 'light', ttlMs: 500, minIntervalMs: 100, run: async () => { runs += 1; } });
  const manager = new CollectorManager({ registry, now: () => now });
  manager.syncPlan(demand('light'));

  await manager.runDue(now);
  assert.equal(runs, 1);
  assert.equal(manager.stateFor('light', 1_499).freshness, 'current');
  assert.equal(manager.stateFor('light', 1_501).freshness, 'stale');
  now = 1_499;
  await manager.runDue(now);
  assert.equal(runs, 1);
  now = 1_500;
  await manager.runDue(now);
  assert.equal(runs, 2);
});

test('failure applies adaptive backoff and success resets it', async () => {
  let now = 1_000;
  let fail = true;
  const registry = new CollectorRegistry();
  registry.register({
    id: 'retrying',
    ttlMs: 100,
    minIntervalMs: 100,
    maxIntervalMs: 2_000,
    backoffFactor: 2,
    run: async () => {
      if (fail) throw new Error('temporary');
      return 'ok';
    }
  });
  const manager = new CollectorManager({ registry, now: () => now });
  manager.syncPlan(demand('retrying'));

  const first = await manager.runCollector('retrying', now);
  assert.equal(first.ok, false);
  assert.equal(manager.stateFor('retrying').freshness, 'stale');
  assert.equal(manager.stateFor('retrying').nextRunAtMs, 1_200);
  now = 1_200;
  fail = false;
  const second = await manager.runCollector('retrying', now);
  assert.equal(second.ok, true);
  assert.equal(manager.stateFor('retrying').freshness, 'current');
  assert.equal(manager.stateFor('retrying').failureCount, 0);
  assert.equal(manager.stateFor('retrying').nextRunAtMs, 1_300);
});

test('priority orders due collectors', async () => {
  const order = [];
  const registry = new CollectorRegistry();
  registry.register({ id: 'low', priority: 10, run: async () => order.push('low') });
  registry.register({ id: 'high', priority: 90, run: async () => order.push('high') });
  const manager = new CollectorManager({ registry, now: () => 1 });
  manager.syncPlan(demand('low', 'high'));
  await manager.runDue(1);
  assert.deepEqual(order, ['high', 'low']);
});

test('running collector is protected from duplicate execution', async () => {
  let release;
  let runs = 0;
  const wait = new Promise((resolve) => { release = resolve; });
  const registry = new CollectorRegistry();
  registry.register({ id: 'slow', run: async () => { runs += 1; await wait; } });
  const manager = new CollectorManager({ registry, now: () => 1 });
  manager.syncPlan(demand('slow'));

  const first = manager.runCollector('slow', 1);
  const second = await manager.runCollector('slow', 1);
  assert.equal(second.ran, false);
  assert.equal(runs, 1);
  release();
  await first;
});

test('central scheduler owns at most one timer and stop removes it', () => {
  let nextId = 0;
  const timers = new Map();
  const manager = { stopAllCalls: 0, async runDue() { return 0; }, stopAll() { this.stopAllCalls += 1; } };
  const scheduler = new CentralScheduler({
    manager,
    setTimer(fn, delay) { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    clearTimer(id) { timers.delete(id); }
  });

  assert.equal(scheduler.start(), true);
  assert.equal(scheduler.start(), false);
  assert.equal(scheduler.activeTimerCount, 1);
  assert.equal(timers.size, 1);
  assert.equal(scheduler.stop(), true);
  assert.equal(scheduler.activeTimerCount, 0);
  assert.equal(timers.size, 0);
  assert.equal(manager.stopAllCalls, 1);
});

test('instrumentation counts scheduler polls and collector runs only when enabled', async () => {
  const now = 100;
  const instrumentation = createTestInstrumentation();
  const registry = new CollectorRegistry();
  registry.register({ id: 'x', run: async () => 'ok' });
  const manager = new CollectorManager({ registry, instrumentation, now: () => now });
  manager.syncPlan(demand('x'));
  await manager.runDue(now);
  instrumentation.recordPoll();
  const snapshot = instrumentation.snapshot();
  assert.equal(snapshot.collectorRuns, 1);
  assert.equal(snapshot.pollCount, 1);
  assert.equal(snapshot.collectors.x.runs, 1);
});
