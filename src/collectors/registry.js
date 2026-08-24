export class CollectorRegistry {
  constructor() {
    this.entries = new Map();
  }

  register({
    id,
    run,
    ttlMs = 1_000,
    priority = 50,
    minIntervalMs = 250,
    maxIntervalMs = 30_000,
    backoffFactor = 2
  }) {
    if (!id || typeof run !== 'function') throw new Error('collector requires id and run function');
    const entry = {
      id,
      run,
      ttlMs: Math.max(0, Number(ttlMs) || 0),
      priority: Number(priority) || 0,
      minIntervalMs: Math.max(0, Number(minIntervalMs) || 0),
      maxIntervalMs: Math.max(0, Number(maxIntervalMs) || 0),
      backoffFactor: Math.max(1, Number(backoffFactor) || 1)
    };
    this.entries.set(id, entry);
    return entry;
  }

  get(id) {
    return this.entries.get(id) ?? null;
  }

  has(id) {
    return this.entries.has(id);
  }

  list() {
    return [...this.entries.values()];
  }
}
