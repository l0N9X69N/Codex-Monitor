import { ARCHIVE_SYNC_STATE } from '../archive/constants.js';
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

export class ManagerArchiveVerifiedIndex extends ManagerArchiveIndex {
  constructor({
    scanSourcesWithHealth = scanArchiveSourcesWithHealth,
    ...options
  } = {}) {
    let lastScan = { sources: [], complete: false, errors: [], limited: false };
    const scanSources = async (rootPath) => {
      lastScan = normalizedScan(await scanSourcesWithHealth(rootPath));
      return lastScan.sources;
    };
    super({ ...options, scanSources });
    this.scanSourcesWithHealth = scanSourcesWithHealth;
    this.lastVerifiedScan = lastScan;
    this._scanState = () => lastScan;
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
      this.lastSnapshot = snapshot;
      return snapshot;
    }

    snapshot.sourceScanComplete = true;
    snapshot.sourceScanErrors = [];
    snapshot.sourceScanLimited = false;
    this.lastSnapshot = snapshot;
    return snapshot;
  }
}
