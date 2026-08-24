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

  stateFor(id) {
    return this.runtime.get(id) ?? null;
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

  async runDue(nowMs = this.now()) {
    const due = this.dueCollectors(nowMs);
    for (const item of due) await this.runCollector(item.collector.id, nowMs);
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
      state.nextRunAtMs = 0;
      state.demand = null;
    }
  }
}
