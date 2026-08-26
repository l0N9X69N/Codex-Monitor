import { buildProcessEvidence } from './session-core.js';

export class SessionManagerTracker {
  constructor({
    core,
    platformAdapter,
    now = () => Date.now(),
    discoveryIntervalMs = 5000,
    processIntervalMs = 2500,
    knownRefreshIntervalMs = 750,
    selectedTailIntervalMs = 500,
    summaryBootstrapLimit = 8
  } = {}) {
    if (!core) throw new Error('SessionManagerTracker requires core');
    this.core = core;
    this.platformAdapter = platformAdapter ?? null;
    this.now = now;
    this.discoveryIntervalMs = discoveryIntervalMs;
    this.processIntervalMs = processIntervalMs;
    this.knownRefreshIntervalMs = knownRefreshIntervalMs;
    this.selectedTailIntervalMs = selectedTailIntervalMs;
    this.summaryBootstrapLimit = Math.max(0, Number(summaryBootstrapLimit) || 0);
    this.lastDiscoveryAtMs = Number.NEGATIVE_INFINITY;
    this.lastProcessAtMs = Number.NEGATIVE_INFINITY;
    this.lastKnownRefreshAtMs = Number.NEGATIVE_INFINITY;
    this.lastSelectedTailAtMs = Number.NEGATIVE_INFINITY;
    this.processEvidence = buildProcessEvidence(null);
    this.lastProcessError = null;
    this.summariesInitialized = false;
  }

  async refreshProcessEvidence(nowMs) {
    if (!this.platformAdapter?.getProcessTree) return false;
    if (nowMs - this.lastProcessAtMs < this.processIntervalMs) return false;
    this.lastProcessAtMs = nowMs;
    try {
      const value = await this.platformAdapter.getProcessTree();
      if (Array.isArray(value)) {
        this.processEvidence = buildProcessEvidence(value);
        this.lastProcessError = null;
      } else {
        this.processEvidence = buildProcessEvidence(null);
        this.lastProcessError = value?.detail ?? null;
      }
    } catch (error) {
      this.processEvidence = buildProcessEvidence(null);
      this.lastProcessError = error?.message ?? 'process query failed';
    }
    return true;
  }

  async tick() {
    const nowMs = this.now();
    const processPolled = await this.refreshProcessEvidence(nowMs);
    let discovered = false;
    let knownRefreshed = false;
    let selectedTailed = false;
    let summariesTailed = false;

    if (nowMs - this.lastDiscoveryAtMs >= this.discoveryIntervalMs) {
      this.lastDiscoveryAtMs = nowMs;
      this.core.discover({ processEvidence: this.processEvidence });
      discovered = true;
      this.lastKnownRefreshAtMs = nowMs;
      if (!this.summariesInitialized) {
        this.core.bootstrapRecentSummaries(this.summaryBootstrapLimit);
        this.summariesInitialized = true;
      } else {
        for (const item of this.core.index) this.core.summaries.ensure(item, { bootstrap: false });
      }
    } else if (nowMs - this.lastKnownRefreshAtMs >= this.knownRefreshIntervalMs) {
      this.lastKnownRefreshAtMs = nowMs;
      this.core.refreshKnown({ processEvidence: this.processEvidence });
      this.core.tailSummaries();
      knownRefreshed = true;
      summariesTailed = true;
    }

    if (this.core.selectedId && nowMs - this.lastSelectedTailAtMs >= this.selectedTailIntervalMs) {
      this.lastSelectedTailAtMs = nowMs;
      this.core.tailSelected();
      selectedTailed = true;
    }

    return {
      atMs: nowMs,
      processPolled,
      discovered,
      knownRefreshed,
      summariesTailed,
      selectedTailed,
      sessions: this.core.index,
      rows: this.core.rows(),
      selected: this.core.selectedModel(),
      selectedDetail: this.core.selectedDetail(),
      processError: this.lastProcessError
    };
  }
}
