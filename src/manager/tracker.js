import { kickArchiveService } from '../archive/integration.js';
import { loadMonitorConfig } from '../config/store.js';
import { ManagerArchiveIndex, mergeManagerArchiveRows } from './archive-index.js';
import { buildProcessEvidence } from './session-core.js';

const REAL_MANAGER_PLATFORMS = new Set(['win32', 'linux', 'darwin']);
const DEFAULT_ARCHIVE_WAKE_INTERVAL_MS = 5000;

function defaultArchiveIndex(core, platformAdapter) {
  if (!core?.sessionsPath || !REAL_MANAGER_PLATFORMS.has(platformAdapter?.id)) return null;
  try {
    const loaded = loadMonitorConfig();
    return new ManagerArchiveIndex({ config: loaded?.config ?? loaded, sessionsPath: core.sessionsPath });
  } catch {
    return null;
  }
}

function archiveNeedsWake(snapshot) {
  if (!snapshot?.enabled) return false;
  if (!snapshot.available) return true;
  return ['CATCHING_UP', 'UNINDEXED', 'STALE'].includes(snapshot.globalSyncState)
    || Number(snapshot.pendingFileCount ?? 0) > 0
    || Number(snapshot.pendingByteCount ?? 0) > 0;
}

export class SessionManagerTracker {
  constructor({
    core,
    platformAdapter,
    archiveIndex = undefined,
    archiveWake = kickArchiveService,
    archiveWakeIntervalMs = DEFAULT_ARCHIVE_WAKE_INTERVAL_MS,
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
    this.archiveIndex = archiveIndex === undefined ? defaultArchiveIndex(core, platformAdapter) : archiveIndex;
    this.archiveWake = typeof archiveWake === 'function' ? archiveWake : null;
    this.archiveWakeIntervalMs = Math.max(1000, Number(archiveWakeIntervalMs) || DEFAULT_ARCHIVE_WAKE_INTERVAL_MS);
    this.archivePrimed = false;
    this.archiveSnapshot = this.archiveIndex?.lastSnapshot ?? null;
    this.lastArchiveWakeAtMs = Number.NEGATIVE_INFINITY;
    this.lastArchiveWake = null;
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

  archiveEnabled() {
    return Boolean(this.archiveIndex?.enabled);
  }

  archiveRows() {
    return this.archiveSnapshot?.available ? (this.archiveSnapshot.rows ?? []) : [];
  }

  mergedRows() {
    const rawRows = this.core.rows();
    return this.archiveSnapshot?.available
      ? mergeManagerArchiveRows(rawRows, this.archiveRows())
      : rawRows;
  }

  maybeWakeArchive(nowMs) {
    if (!this.archiveWake || !archiveNeedsWake(this.archiveSnapshot)) return false;
    if (nowMs - this.lastArchiveWakeAtMs < this.archiveWakeIntervalMs) return false;
    this.lastArchiveWakeAtMs = nowMs;
    try {
      this.lastArchiveWake = this.archiveWake(this.archiveIndex?.config ?? { archive: { enabled: true } });
    } catch (error) {
      this.lastArchiveWake = {
        attempted: true,
        started: false,
        running: false,
        reason: 'manager-wake-failed',
        error: error?.message ?? String(error)
      };
    }
    return true;
  }

  archiveResultFields() {
    const snapshot = this.archiveSnapshot;
    const health = snapshot?.health ?? null;
    return {
      archiveEnabled: Boolean(snapshot?.enabled),
      archiveAvailable: Boolean(snapshot?.available),
      archiveSourceScanComplete: Boolean(snapshot?.sourceScanComplete),
      archiveSyncState: snapshot?.globalSyncState ?? null,
      archivePendingFileCount: Number(snapshot?.pendingFileCount ?? 0),
      archivePendingByteCount: Number(snapshot?.pendingByteCount ?? 0),
      archiveSourceCount: Number(snapshot?.sourceCount ?? 0),
      archiveReconcileGeneration: Number(health?.reconcileGeneration ?? 0),
      archiveLastSuccessfulReconcile: health?.lastSuccessfulReconcile ?? null,
      archiveLastSeenSourceScan: health?.lastSeenSourceScan ?? null,
      archiveHookLastSeenAt: health?.hookLastSeenAt ?? null,
      archiveWatcherLastSeenAt: health?.watcherLastSeenAt ?? null,
      archiveServiceInstanceId: health?.serviceInstanceId ?? null,
      archiveWake: this.lastArchiveWake,
      archiveError: snapshot?.error ?? null
    };
  }

  async tick() {
    const nowMs = this.now();

    if (this.archiveEnabled() && !this.archivePrimed) {
      this.archivePrimed = true;
      this.archiveSnapshot = this.archiveIndex.open();
      this.maybeWakeArchive(nowMs);
      if (this.archiveSnapshot?.available) {
        this.cachedRows = [...(this.archiveSnapshot.rows ?? [])];
        this.hasCachedRows = true;
        return {
          atMs: nowMs,
          changed: true,
          processPolled: false,
          discovered: false,
          coldSwept: false,
          knownRefreshed: false,
          summariesTailed: false,
          selectedTailed: false,
          sessions: this.core.index,
          rows: this.cachedRows,
          selected: null,
          selectedDetail: null,
          processDiagnostics: this.processEvidence.diagnostics ?? null,
          processError: this.lastProcessError,
          ...this.archiveResultFields()
        };
      }
    }

    if (this.archiveEnabled()) {
      this.archiveSnapshot = await this.archiveIndex.refresh();
      this.maybeWakeArchive(nowMs);
    }

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

    const changed = firstDiscovery || discovered || coldSwept || knownRefreshed || summariesTailed || selectedTailed || processPolled || this.archiveEnabled();
    if (changed || !this.hasCachedRows) {
      this.cachedRows = this.mergedRows();
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
      processError: this.lastProcessError,
      ...this.archiveResultFields()
    };
  }

  close() {
    try { this.archiveIndex?.close?.(); } catch {}
  }
}

export { archiveNeedsWake };
