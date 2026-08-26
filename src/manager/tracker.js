import { buildProcessEvidence } from './session-core.js';

export class SessionManagerTracker {
  constructor({
    core,
    platformAdapter,
    now = () => Date.now(),
    discoveryIntervalMs = 5000,
    coldSweepIntervalMs = 60_000,
    processIntervalMs = 2500,
    knownRefreshIntervalMs = 750,
    selectedTailIntervalMs = 500,
    summaryBootstrapLimit = 8,
    fastRefreshLimit = 16
  } = {}) {
    if (!core) throw new Error('SessionManagerTracker requires core');
    this.core = core;
    this.platformAdapter = platformAdapter ?? null;
    this.now = now;
    this.discoveryIntervalMs = Math.max(1000, Number(discoveryIntervalMs) || 5000);
    this.coldSweepIntervalMs = Math.max(this.discoveryIntervalMs, Number(coldSweepIntervalMs) || 60_000);
    this.processIntervalMs = processIntervalMs;
    this.knownRefreshIntervalMs = knownRefreshIntervalMs;
    this.selectedTailIntervalMs = selectedTailIntervalMs;
    this.summaryBootstrapLimit = Math.max(0, Number(summaryBootstrapLimit) || 0);
    this.fastRefreshLimit = Math.max(0, Number(fastRefreshLimit) || 0);
    this.lastDiscoveryAtMs = Number.NEGATIVE_INFINITY;
    this.lastColdSweepAtMs = Number.NEGATIVE_INFINITY;
    this.lastProcessAtMs = Number.NEGATIVE_INFINITY;
    this.lastKnownRefreshAtMs = Number.NEGATIVE_INFINITY;
    this.lastSelectedTailAtMs = Number.NEGATIVE_INFINITY;
    this.processEvidence = buildProcessEvidence(null);
    this.processAssociations = new Map();
    this.lastProcessError = null;
    this.summariesInitialized = false;
    this.cachedRows = [];
    this.hasCachedRows = false;
  }

  async refreshProcessEvidence(nowMs) {
    if (!this.platformAdapter?.getProcessTree) return false;
    if (nowMs - this.lastProcessAtMs < this.processIntervalMs) return false;
    this.lastProcessAtMs = nowMs;
    try {
      const value = await this.platformAdapter.getProcessTree();
      if (Array.isArray(value)) {
        this.processEvidence = buildProcessEvidence(value, {
          nowMs,
          sessions: this.core.index,
          previousAssociations: this.processAssociations
        });
        this.processAssociations = this.processEvidence.associations ?? this.processAssociations;
        this.lastProcessError = null;
      } else {
        this.processEvidence = buildProcessEvidence(null, {
          nowMs,
          sessions: this.core.index,
          previousAssociations: this.processAssociations
        });
        this.lastProcessError = value?.detail ?? null;
      }
    } catch (error) {
      this.processEvidence = buildProcessEvidence(null, {
        nowMs,
        sessions: this.core.index,
        previousAssociations: this.processAssociations
      });
      this.lastProcessError = error?.message ?? 'process query failed';
    }
    return true;
  }

  initializeSummaries() {
    if (this.summariesInitialized) return;
    this.core.bootstrapRecentSummaries(this.summaryBootstrapLimit);
    this.summariesInitialized = true;
  }

  fastRefreshIds() {
    const ids = new Set();
    if (this.core.selectedId) ids.add(this.core.selectedId);
    for (const [sessionId] of this.processAssociations) ids.add(sessionId);
    for (const item of this.core.index) {
      if (item.state === 'LIVE') ids.add(item.id);
    }
    return ids;
  }

  refreshHotSessions() {
    const ids = this.fastRefreshIds();
    this.core.refreshKnown({
      processEvidence: this.processEvidence,
      limit: this.fastRefreshLimit,
      ids
    });
    this.core.tailSummaries({
      limit: this.fastRefreshLimit,
      ids,
      bootstrapLive: true
    });
  }

  async tick() {
    const nowMs = this.now();
    const discoveryDue = nowMs - this.lastDiscoveryAtMs >= this.discoveryIntervalMs;
    const firstDiscovery = discoveryDue && this.core.index.length === 0;
    const coldSweepDue = nowMs - this.lastColdSweepAtMs >= this.coldSweepIntervalMs;
    let discovered = false;
    let coldSwept = false;
    let knownRefreshed = false;
    let selectedTailed = false;
    let summariesTailed = false;
    let processPolled = false;

    if (firstDiscovery) {
      this.lastDiscoveryAtMs = nowMs;
      this.lastColdSweepAtMs = nowMs;
      this.core.discover();
      discovered = true;
      this.lastKnownRefreshAtMs = nowMs;
      this.initializeSummaries();
      processPolled = await this.refreshProcessEvidence(nowMs);
      this.refreshHotSessions();
      knownRefreshed = true;
      summariesTailed = true;
    } else {
      processPolled = await this.refreshProcessEvidence(nowMs);
      if (discoveryDue) {
        this.lastDiscoveryAtMs = nowMs;
        const refreshKnownMetadata = coldSweepDue;
        this.core.discover({
          processEvidence: this.processEvidence,
          refreshKnownMetadata
        });
        discovered = true;
        if (refreshKnownMetadata) {
          this.lastColdSweepAtMs = nowMs;
          coldSwept = true;
        }
        this.initializeSummaries();
      }

      if (nowMs - this.lastKnownRefreshAtMs >= this.knownRefreshIntervalMs) {
        this.lastKnownRefreshAtMs = nowMs;
        this.refreshHotSessions();
        knownRefreshed = true;
        summariesTailed = true;
      }
    }

    if (this.core.selectedId && nowMs - this.lastSelectedTailAtMs >= this.selectedTailIntervalMs) {
      this.lastSelectedTailAtMs = nowMs;
      const selectedResult = this.core.tailSelected();
      selectedTailed = Boolean(selectedResult?.changed || selectedResult?.reset || selectedResult?.error);
    }

    const changed = firstDiscovery || discovered || coldSwept || knownRefreshed || summariesTailed || selectedTailed || processPolled;
    if (changed || !this.hasCachedRows) {
      this.cachedRows = this.core.rows();
      this.hasCachedRows = true;
    }

    return {
      atMs: nowMs,
      changed,
      processPolled,
      discovered,
      coldSwept,
      knownRefreshed,
      summariesTailed,
      selectedTailed,
      sessions: this.core.index,
      rows: this.cachedRows,
      selected: this.core.selectedModel(),
      selectedDetail: this.core.selectedDetail(),
      processDiagnostics: this.processEvidence.diagnostics ?? null,
      processError: this.lastProcessError
    };
  }
}
