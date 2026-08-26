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
        this.processEvidence = buildProcessEvidence(value, { nowMs, sessions: this.core.index });
        this.lastProcessError = null;
      } else {
        this.processEvidence = buildProcessEvidence(null, { nowMs, sessions: this.core.index });
        this.lastProcessError = value?.detail ?? null;
      }
    } catch (error) {
      this.processEvidence = buildProcessEvidence(null, { nowMs, sessions: this.core.index });
      this.lastProcessError = error?.message ?? 'process query failed';
    }
    return true;
  }

  initializeSummaries() {
    if (!this.summariesInitialized) {
      this.core.bootstrapRecentSummaries(this.summaryBootstrapLimit);
      this.summariesInitialized = true;
    } else {
      for (const item of this.core.index) this.core.summaries.ensure(item, { bootstrap: false });
    }
  }

  async tick() {
    const nowMs = this.now();
    const discoveryDue = nowMs - this.lastDiscoveryAtMs >= this.discoveryIntervalMs;
    const firstDiscovery = discoveryDue && this.core.index.length === 0;
    let discovered = false;
    let knownRefreshed = false;
    let selectedTailed = false;
    let summariesTailed = false;
    let processPolled = false;

    if (firstDiscovery) {
      this.lastDiscoveryAtMs = nowMs;
      this.core.discover();
      discovered = true;
      this.lastKnownRefreshAtMs = nowMs;
      this.initializeSummaries();
      processPolled = await this.refreshProcessEvidence(nowMs);
      this.core.refreshKnown({ processEvidence: this.processEvidence });
    } else {
      processPolled = await this.refreshProcessEvidence(nowMs);
      if (discoveryDue) {
        this.lastDiscoveryAtMs = nowMs;
        this.core.discover({ processEvidence: this.processEvidence });
        discovered = true;
        this.lastKnownRefreshAtMs = nowMs;
        this.initializeSummaries();
      } else if (nowMs - this.lastKnownRefreshAtMs >= this.knownRefreshIntervalMs) {
        this.lastKnownRefreshAtMs = nowMs;
        this.core.refreshKnown({ processEvidence: this.processEvidence });
        this.core.tailSummaries();
        knownRefreshed = true;
        summariesTailed = true;
      }
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
      processDiagnostics: this.processEvidence.diagnostics ?? null,
      processError: this.lastProcessError
    };
  }
}
