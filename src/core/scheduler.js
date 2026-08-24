export class CentralScheduler {
  constructor({
    manager,
    instrumentation = null,
    tickMs = 100,
    maxCollectorRunsPerTick = 2,
    yieldControl = () => new Promise((resolve) => setImmediate(resolve)),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    now = () => Date.now()
  } = {}) {
    if (!manager) throw new Error('CentralScheduler requires a CollectorManager');
    this.manager = manager;
    this.instrumentation = instrumentation;
    this.tickMs = Math.max(10, Number(tickMs) || 100);
    this.maxCollectorRunsPerTick = Math.max(1, Number(maxCollectorRunsPerTick) || 1);
    this.yieldControl = yieldControl;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.timer = null;
    this.running = false;
    this.tickInFlight = false;
  }

  start() {
    if (this.running) return false;
    this.running = true;
    this.scheduleNext(0);
    return true;
  }

  stop() {
    if (!this.running && !this.timer) return false;
    this.running = false;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.manager.stopAll();
    return true;
  }

  scheduleNext(delayMs = this.tickMs) {
    if (!this.running || this.timer) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.tick();
    }, Math.max(0, delayMs));
  }

  async tick() {
    if (!this.running || this.tickInFlight) {
      if (this.running) this.scheduleNext();
      return 0;
    }

    this.tickInFlight = true;
    this.instrumentation?.recordPoll?.();
    let runs = 0;
    try {
      runs = await this.manager.runDue(this.now(), {
        limit: this.maxCollectorRunsPerTick,
        yieldBetween: this.yieldControl
      });
    } finally {
      this.tickInFlight = false;
      this.scheduleNext();
    }
    return runs;
  }

  get activeTimerCount() {
    return this.timer ? 1 : 0;
  }
}
