import { ARCHIVE_SYNC_STATE } from './constants.js';

export const ARCHIVE_SERVICE_DEFAULTS = Object.freeze({
  activeDelayMs: 25,
  stalledDelayMs: 1_000,
  safetySweepMs: 30_000,
  idleGraceMs: 5 * 60_000
});

function positiveMs(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function cycleMadeProgress(cycle) {
  return Array.isArray(cycle?.results) && cycle.results.some((result) => (
    result?.advanced === true || result?.state === ARCHIVE_SYNC_STATE.ARCHIVED
  ));
}

export class ArchiveServiceRuntime {
  constructor({
    coordinator,
    healthStore,
    instanceId,
    now = () => Date.now(),
    waitForSignal = null,
    shouldStop = () => false,
    activeDelayMs = ARCHIVE_SERVICE_DEFAULTS.activeDelayMs,
    stalledDelayMs = ARCHIVE_SERVICE_DEFAULTS.stalledDelayMs,
    safetySweepMs = ARCHIVE_SERVICE_DEFAULTS.safetySweepMs,
    idleGraceMs = ARCHIVE_SERVICE_DEFAULTS.idleGraceMs,
    onError = () => {}
  } = {}) {
    if (!coordinator?.runCycle) throw new TypeError('ArchiveServiceRuntime requires a reconcile coordinator');
    if (!healthStore) throw new TypeError('ArchiveServiceRuntime requires an archive health store');
    if (!instanceId) throw new Error('ArchiveServiceRuntime requires instanceId');
    this.coordinator = coordinator;
    this.health = healthStore;
    this.instanceId = String(instanceId);
    this.now = now;
    this.waitForSignal = waitForSignal;
    this.shouldStop = typeof shouldStop === 'function' ? shouldStop : () => false;
    this.activeDelayMs = positiveMs(activeDelayMs, ARCHIVE_SERVICE_DEFAULTS.activeDelayMs);
    this.stalledDelayMs = positiveMs(stalledDelayMs, ARCHIVE_SERVICE_DEFAULTS.stalledDelayMs);
    this.safetySweepMs = positiveMs(safetySweepMs, ARCHIVE_SERVICE_DEFAULTS.safetySweepMs);
    this.idleGraceMs = positiveMs(idleGraceMs, ARCHIVE_SERVICE_DEFAULTS.idleGraceMs);
    this.onError = onError;
    this.stopped = false;
    this.running = false;
    this.pendingSignal = null;
    this.waitResolve = null;
  }

  wake(reason = 'wake') {
    const signal = String(reason || 'wake');
    if (this.waitResolve) {
      const resolve = this.waitResolve;
      this.waitResolve = null;
      resolve(signal);
      return true;
    }
    this.pendingSignal = signal;
    return true;
  }

  stop() {
    this.stopped = true;
    this.wake('stop');
  }

  _stopRequested() {
    if (this.stopped) return true;
    try {
      if (this.shouldStop()) {
        this.stop();
        return true;
      }
    } catch (error) {
      try { this.onError(error); } catch {}
    }
    return this.stopped;
  }

  async _wait(timeoutMs) {
    if (this._stopRequested()) return 'stop';
    if (this.pendingSignal) {
      const signal = this.pendingSignal;
      this.pendingSignal = null;
      return signal;
    }
    if (typeof this.waitForSignal === 'function') return await this.waitForSignal(timeoutMs);

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.waitResolve === finish) this.waitResolve = null;
        resolve(value);
      };
      const timer = setTimeout(() => finish('timeout'), timeoutMs);
      timer.unref?.();
      this.waitResolve = finish;
    });
  }

  async run() {
    if (this.running) throw new Error('archive service runtime is already running');
    this.running = true;
    this.stopped = false;
    let lastActiveAt = Number(this.now());
    let cycles = 0;
    let failures = 0;
    let lastError = null;

    this.health.markServiceStarted?.(this.instanceId);
    try {
      while (!this._stopRequested()) {
        let cycle = null;
        let cycleFailed = false;
        try {
          cycle = await this.coordinator.runCycle();
        } catch (error) {
          cycleFailed = true;
          failures += 1;
          lastError = error?.message ?? String(error);
          try { this.onError(error); } catch {}
          cycle = { pendingFileCount: 1, results: [] };
        }
        cycles += 1;
        if (this._stopRequested()) break;

        const progressed = !cycleFailed && cycleMadeProgress(cycle);
        if (progressed) lastActiveAt = Number(this.now());
        const pending = cycleFailed || Number(cycle?.pendingFileCount ?? 0) > 0;
        const nowMs = Number(this.now());
        const remainingIdle = Math.max(0, this.idleGraceMs - Math.max(0, nowMs - lastActiveAt));
        if (remainingIdle <= 0) break;

        const baseDelay = pending
          ? (progressed ? this.activeDelayMs : this.stalledDelayMs)
          : this.safetySweepMs;
        const delay = Math.max(1, Math.min(baseDelay, remainingIdle));
        const signal = await this._wait(delay);
        if (signal === 'stop' || this._stopRequested()) break;
        if (signal && signal !== 'timeout') lastActiveAt = Number(this.now());
        if (signal === 'timeout' && Number(this.now()) - lastActiveAt >= this.idleGraceMs) break;
      }

      return { cycles, failures, lastError, stopped: this.stopped };
    } finally {
      this.running = false;
      this.health.markServiceStopped?.(this.instanceId);
    }
  }
}
