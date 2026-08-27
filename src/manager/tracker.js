import { kickArchiveService } from '../archive/integration.js';
import { loadMonitorConfig } from '../config/store.js';
import {
  applyManagerArchiveOverlay,
  ManagerArchiveLiveOverlay,
  managerArchiveOverlayPathKey
} from './archive-live-overlay.js';
import { mergeManagerArchiveRows } from './archive-row-merge.js';
import { readManagerArchiveDetail } from './archive-detail.js';
import { ManagerArchiveVerifiedIndex } from './archive-verified-index.js';
import { buildProcessEvidence } from './session-core.js';

const REAL_MANAGER_PLATFORMS = new Set(['win32', 'linux', 'darwin']);
const DEFAULT_ARCHIVE_WAKE_INTERVAL_MS = 5000;
const DEFAULT_ARCHIVE_REFRESH_INTERVAL_MS = 2500;
const DEFAULT_ARCHIVE_OVERLAY_INTERVAL_MS = 500;

function defaultArchiveIndex(core, platformAdapter) {
  if (!core?.sessionsPath || !REAL_MANAGER_PLATFORMS.has(platformAdapter?.id)) return null;
  try {
    const loaded = loadMonitorConfig();
    return new ManagerArchiveVerifiedIndex({ config: loaded?.config ?? loaded, sessionsPath: core.sessionsPath });
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
    archiveWake = undefined,
    archiveWakeIntervalMs = DEFAULT_ARCHIVE_WAKE_INTERVAL_MS,
    archiveRefreshIntervalMs = DEFAULT_ARCHIVE_REFRESH_INTERVAL_MS,
    archiveOverlayIntervalMs = DEFAULT_ARCHIVE_OVERLAY_INTERVAL_MS,
    archiveLiveOverlay = undefined,
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
    const usesDefaultArchiveIndex = archiveIndex === undefined;
    this.core = core;
    this.platformAdapter = platformAdapter ?? null;
    this.archiveIndex = usesDefaultArchiveIndex ? defaultArchiveIndex(core, platformAdapter) : archiveIndex;
    this.archiveWake = archiveWake === undefined
      ? (usesDefaultArchiveIndex ? kickArchiveService : null)
      : (typeof archiveWake === 'function' ? archiveWake : null);
    this.archiveWakeIntervalMs = Math.max(1000, Number(archiveWakeIntervalMs) || DEFAULT_ARCHIVE_WAKE_INTERVAL_MS);
    this.archiveRefreshIntervalMs = Math.max(500, Number(archiveRefreshIntervalMs) || DEFAULT_ARCHIVE_REFRESH_INTERVAL_MS);
    this.archiveOverlayIntervalMs = Math.max(100, Number(archiveOverlayIntervalMs) || DEFAULT_ARCHIVE_OVERLAY_INTERVAL_MS);
    this.archiveLiveOverlay = archiveLiveOverlay === undefined
      ? new ManagerArchiveLiveOverlay()
      : archiveLiveOverlay;
    this.archivePrimed = false;
    this.archiveSnapshot = this.archiveIndex?.lastSnapshot ?? null;
    this.archiveOverlays = new Map();
    this.lastArchiveWakeAtMs = Number.NEGATIVE_INFINITY;
    this.lastArchiveWake = null;
    this.lastArchiveRefreshAtMs = Number.NEGATIVE_INFINITY;
    this.lastArchiveOverlayAtMs = Number.NEGATIVE_INFINITY;
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

  archiveRowsWithOverlay() {
    return this.archiveRows().map((row) => {
      const key = managerArchiveOverlayPathKey(row?.filePath ?? row?.sourcePath);
      return applyManagerArchiveOverlay(row, key ? this.archiveOverlays.get(key) : null);
    });
  }

  mergedRows(rawRows = this.core.rows()) {
    return this.archiveSnapshot?.available
      ? mergeManagerArchiveRows(rawRows, this.archiveRowsWithOverlay())
      : rawRows;
  }

  archiveDetailForRow(row) {
    try {
      return readManagerArchiveDetail(this.archiveIndex, row);
    } catch {
      return null;
    }
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

  async maybeRefreshArchive(nowMs) {
    if (!this.archiveEnabled()) return false;
    if (nowMs - this.lastArchiveRefreshAtMs < this.archiveRefreshIntervalMs) return false;
    this.lastArchiveRefreshAtMs = nowMs;
    this.archiveSnapshot = await this.archiveIndex.refresh();
    this.maybeWakeArchive(nowMs);
    return true;
  }

  async maybeUpdateArchiveOverlay(nowMs, rawRows) {
    if (!this.archiveSnapshot?.available || !this.archiveLiveOverlay?.update) return false;
    if (nowMs - this.lastArchiveOverlayAtMs < this.archiveOverlayIntervalMs) return false;
    this.lastArchiveOverlayAtMs = nowMs;
    try {
      const result = await this.archiveLiveOverlay.update(rawRows, this.archiveRows());
      this.archiveOverlays = result?.overlays instanceof Map ? result.overlays : new Map();
      return Boolean(result?.changed);
    } catch {
      return false;
    }
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
          archiveRefreshed: false,
          archiveOverlayChanged: false,
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

    const archiveRefreshed = await this.maybeRefreshArchive(nowMs);
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

    const rawRows = this.core.rows();
    const archiveOverlayChanged = await this.maybeUpdateArchiveOverlay(nowMs, rawRows);
    const changed = firstDiscovery
      || discovered
      || coldSwept
      || knownRefreshed
      || summariesTailed
      || selectedTailed
      || processPolled
      || archiveRefreshed
      || archiveOverlayChanged;
    if (changed || !this.hasCachedRows) {
      this.cachedRows = this.mergedRows(rawRows);
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
      archiveRefreshed,
      archiveOverlayChanged,
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
    try { this.archiveLiveOverlay?.reset?.(); } catch {}
    try { this.archiveIndex?.close?.(); } catch {}
  }
}

export { archiveNeedsWake };
