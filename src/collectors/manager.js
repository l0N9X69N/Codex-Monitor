import { FRESHNESS } from '../core/freshness.js';

export class CollectorManager {
  constructor({ registry, instrumentation = null, now = () => Date.now() } = {}) {
    if (!registry) throw new Error('CollectorManager requires a registry');
    this.registry = registry;
    this.instrumentation = instrumentation;
    this.now = now;
    this.runtime = new Map();
  }

  syncPlan(demandGraph) {
    const demanded = new Map((demandGraph?.collectors ?? []).map((entry) => [entry.collectorId, entry]));

    for (const collector of this.registry.list()) {
      const current = this.runtime.get(collector.id) ?? {
        enabled: false,
        running: false,
        freshness: FRESHNESS.WAITING,
        lastStartedAtMs: null,
        lastFinishedAtMs: null,
        nextRunAtMs: 0,
        failureCount: 0,
        lastError: null,
        demand: null
      };
      current.enabled = demanded.has(collector.id);
      current.demand = demanded.get(collector.id) ?? null;
      if (!current.enabled) current.nextRunAtMs = 0;
      this.runtime.set(collector.id, current);
    }
  }

  stateFor(id, nowMs = this.now()) {
    const state = this.runtime.get(id) ?? null;
    if (!state) return null;
    const collector = this.registry.get(id);
    if (!collector || !state.enabled || state.lastFinishedAtMs == null) {
      state.freshness = FRESHNESS.WAITING;
    } else if (nowMs - state.lastFinishedAtMs > collector.ttlMs) {
      state.freshness = FRESHNESS.STALE;
    } else {
      state.freshness = FRESHNESS.CURRENT;
    }
    return state;
  }

  dueCollectors(nowMs = this.now()) {
    const due = [];
    for (const collector of this.registry.list()) {
      const state = this.runtime.get(collector.id);
      if (!state?.enabled || state.running) continue;
      if (state.nextRunAtMs > nowMs) continue;
      due.push({ collector, state });
    }
    return due.sort((a, b) => b.collector.priority - a.collector.priority);
  }

  async runDue(nowMs = this.now(), {
    limit = Number.POSITIVE_INFINITY,
    yieldBetween = null
  } = {}) {
    const due = this.dueCollectors(nowMs).slice(0, Math.max(0, limit));
    for (let index = 0; index < due.length; index += 1) {
      await this.runCollector(due[index].collector.id, nowMs);
      if (yieldBetween && index < due.length - 1) await yieldBetween();
    }
    return due.length;
  }

  async runCollector(id, nowMs = this.now()) {
    const collector = this.registry.get(id);
    const state = this.runtime.get(id);
    if (!collector || !state?.enabled || state.running) return { ran: false };

    state.running = true;
    state.lastStartedAtMs = nowMs;
    const started = this.now();
    let ok = true;
    let value;
    let error = null;

    try {
      value = await collector.run({ demand: state.demand, nowMs });
      state.failureCount = 0;
      state.lastError = null;
    } catch (caught) {
      ok = false;
      error = caught;
      state.failureCount += 1;
      state.lastError = caught;
    } finally {
      state.running = false;
      state.lastFinishedAtMs = this.now();
      state.freshness = ok ? FRESHNESS.CURRENT : FRESHNESS.STALE;
      const durationMs = Math.max(0, state.lastFinishedAtMs - started);
      this.instrumentation?.recordCollectorRun?.(id, durationMs, { ok });

      const base = Math.max(collector.minIntervalMs, collector.ttlMs);
      const backedOff = ok ? base : Math.min(
        collector.maxIntervalMs,
        Math.max(base, base * (collector.backoffFactor ** state.failureCount))
      );
      state.nextRunAtMs = nowMs + backedOff;
    }

    return { ran: true, ok, value, error };
  }

  stopAll() {
    for (const state of this.runtime.values()) {
      state.enabled = false;
      state.freshness = FRESHNESS.WAITING;
      state.nextRunAtMs = 0;
      state.demand = null;
    }
  }
}
