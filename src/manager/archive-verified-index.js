import { ARCHIVE_SYNC_STATE } from '../archive/constants.js';
import { getArchiveServiceStatus } from '../archive/service-control.js';
import { scanArchiveSourcesWithHealth } from '../archive/source-scan.js';
import { ManagerArchiveIndex } from './archive-index.js';

function normalizedScan(value) {
  if (Array.isArray(value)) return { sources: value, complete: true, errors: [], limited: false };
  return {
    sources: Array.isArray(value?.sources) ? value.sources : [],
    complete: value?.complete === true,
    errors: Array.isArray(value?.errors) ? value.errors : [],
    limited: value?.limited === true
  };
}

function normalizeServiceStatus(status, metadataInstanceId = null) {
  const running = status?.running === true;
  const owner = status?.owner ?? null;
  const ownerInstanceId = owner?.instanceId ? String(owner.instanceId) : null;
  const storedInstanceId = metadataInstanceId ? String(metadataInstanceId) : null;
  const staleLock = Boolean(owner && !running);
  const metadataStale = Boolean(storedInstanceId && (
    !running || (ownerInstanceId && ownerInstanceId !== storedInstanceId)
  ));
  const ownerMismatch = Boolean(running && storedInstanceId && ownerInstanceId && ownerInstanceId !== storedInstanceId);
  return {
    checked: true,
    running,
    ownerInstanceId,
    ownerPid: Number.isSafeInteger(Number(owner?.pid)) ? Number(owner.pid) : null,
    ownerStartedAt: Number.isFinite(Number(owner?.startedAt)) ? Math.trunc(Number(owner.startedAt)) : null,
    metadataInstanceId: storedInstanceId,
    staleLock,
    metadataStale,
    ownerMismatch,
    stale: staleLock || metadataStale || ownerMismatch,
    error: null
  };
}

export class ManagerArchiveVerifiedIndex extends ManagerArchiveIndex {
  constructor({
    scanSourcesWithHealth = scanArchiveSourcesWithHealth,
    readServiceStatus = undefined,
    ...options
  } = {}) {
    let lastScan = { sources: [], complete: false, errors: [], limited: false };
    const scanSources = async (rootPath) => {
      lastScan = normalizedScan(await scanSourcesWithHealth(rootPath));
      return lastScan.sources;
    };
    const usesDefaultDatabase = options.openDatabase === undefined;
    super({ ...options, scanSources });
    this.scanSourcesWithHealth = scanSourcesWithHealth;
    this.readServiceStatus = readServiceStatus === undefined
      ? (usesDefaultDatabase ? getArchiveServiceStatus : null)
      : (typeof readServiceStatus === 'function' ? readServiceStatus : null);
    this.lastVerifiedScan = lastScan;
    this.lastServiceStatus = {
      checked: false,
      running: false,
      ownerInstanceId: null,
      metadataInstanceId: null,
      stale: false,
      error: null
    };
    this._scanState = () => lastScan;
  }

  verifyServiceLiveness(snapshot) {
    if (!snapshot?.available) return snapshot;
    const metadataInstanceId = snapshot.health?.serviceMetadataInstanceId
      ?? snapshot.health?.serviceInstanceId
      ?? null;
    try {
      const raw = this.readServiceStatus ? this.readServiceStatus() : null;
      const status = this.readServiceStatus
        ? normalizeServiceStatus(raw, metadataInstanceId)
        : {
            checked: false,
            running: Boolean(metadataInstanceId),
            ownerInstanceId: metadataInstanceId,
            metadataInstanceId,
            stale: false,
            error: null
          };
      this.lastServiceStatus = status;
      snapshot.serviceStatus = status;
      if (snapshot.health) {
        snapshot.health = {
          ...snapshot.health,
          serviceInstanceId: status.running ? (status.ownerInstanceId ?? metadataInstanceId) : null,
          serviceMetadataInstanceId: metadataInstanceId,
          serviceStale: status.stale === true,
          serviceStatusError: status.error ?? null
        };
      }
    } catch (error) {
      const status = {
        ...this.lastServiceStatus,
        checked: true,
        metadataInstanceId,
        error: error?.message ?? String(error)
      };
      this.lastServiceStatus = status;
      snapshot.serviceStatus = status;
      if (snapshot.health) {
        snapshot.health = {
          ...snapshot.health,
          serviceMetadataInstanceId: metadataInstanceId,
          serviceStale: status.stale === true,
          serviceStatusError: status.error
        };
      }
    }
    return snapshot;
  }

  open() {
    const snapshot = super.open();
    if (!snapshot?.available) return snapshot;
    this.verifyServiceLiveness(snapshot);
    this.lastSnapshot = snapshot;
    return snapshot;
  }

  async refresh() {
    const snapshot = await super.refresh();
    const scan = this._scanState();
    this.lastVerifiedScan = scan;
    if (!snapshot?.available) return snapshot;

    const scanError = scan.errors.length
      ? `${scan.errors.length} source scan error${scan.errors.length === 1 ? '' : 's'}`
      : scan.limited ? 'source scan limited' : null;

    if (!scan.complete) {
      const storedRows = this._readRows({ verified: false });
      const storedByThread = new Map(storedRows.map((row) => [row.threadId, row]));
      snapshot.rows = (snapshot.rows ?? []).map((row) => {
        const stored = row?.threadId ? storedByThread.get(row.threadId) : null;
        if (stored?.rawSourceExists !== false && row?.rawSourceExists === false) {
          return {
            ...stored,
            archiveSyncState: ARCHIVE_SYNC_STATE.CATCHING_UP,
            archiveVerified: false
          };
        }
        if (row?.archiveSyncState === ARCHIVE_SYNC_STATE.READY) {
          return {
            ...row,
            archiveSyncState: ARCHIVE_SYNC_STATE.CATCHING_UP,
            archiveVerified: false
          };
        }
        return row;
      });
      snapshot.sourceScanComplete = false;
      snapshot.globalSyncState = ARCHIVE_SYNC_STATE.CATCHING_UP;
      snapshot.sourceScanErrors = scan.errors;
      snapshot.sourceScanLimited = scan.limited;
      snapshot.error = snapshot.error ?? scanError;
      this.verifyServiceLiveness(snapshot);
      this.lastSnapshot = snapshot;
      return snapshot;
    }

    snapshot.sourceScanComplete = true;
    snapshot.sourceScanErrors = [];
    snapshot.sourceScanLimited = false;
    this.verifyServiceLiveness(snapshot);
    this.lastSnapshot = snapshot;
    return snapshot;
  }
}

export { normalizeServiceStatus as normalizeManagerArchiveServiceStatus };
