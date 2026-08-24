export class PerformanceInstrumentation {
  constructor({ enabled = false } = {}) {
    this.enabled = Boolean(enabled);
    this.reset();
  }

  reset() {
    this.collectorRuns = 0;
    this.pollCount = 0;
    this.repaintCount = 0;
    this.bytesWritten = 0;
    this.durationMs = 0;
    this.collectors = new Map();
  }

  recordPoll() {
    if (!this.enabled) return;
    this.pollCount += 1;
  }

  recordCollectorRun(collectorId, durationMs = 0, { ok = true } = {}) {
    if (!this.enabled) return;
    const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
    this.collectorRuns += 1;
    this.durationMs += duration;

    const current = this.collectors.get(collectorId) ?? {
      runs: 0,
      failures: 0,
      durationMs: 0,
      maxDurationMs: 0
    };
    current.runs += 1;
    if (!ok) current.failures += 1;
    current.durationMs += duration;
    current.maxDurationMs = Math.max(current.maxDurationMs, duration);
    this.collectors.set(collectorId, current);
  }

  recordRepaint(bytes = 0, durationMs = 0) {
    if (!this.enabled) return;
    const safeBytes = Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
    const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
    this.repaintCount += 1;
    this.bytesWritten += safeBytes;
    this.durationMs += duration;
  }

  snapshot() {
    return {
      collectorRuns: this.collectorRuns,
      pollCount: this.pollCount,
      repaintCount: this.repaintCount,
      bytesWritten: this.bytesWritten,
      durationMs: this.durationMs,
      collectors: Object.fromEntries(
        [...this.collectors.entries()].map(([id, value]) => [id, { ...value }])
      )
    };
  }
}

export function createTestInstrumentation() {
  return new PerformanceInstrumentation({ enabled: true });
}
