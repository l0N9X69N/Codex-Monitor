function finiteInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
}

function fmtBytes(value) {
  const bytes = finiteInteger(value, 0);
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(1)}G`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

export function managerArchiveStatusFromResult(result = {}) {
  return {
    enabled: Boolean(result.archiveEnabled),
    available: Boolean(result.archiveAvailable),
    scanComplete: Boolean(result.archiveSourceScanComplete),
    syncState: result.archiveSyncState ?? null,
    pendingFileCount: finiteInteger(result.archivePendingFileCount, 0),
    pendingByteCount: finiteInteger(result.archivePendingByteCount, 0),
    sourceCount: finiteInteger(result.archiveSourceCount, 0),
    reconcileGeneration: finiteInteger(result.archiveReconcileGeneration, 0),
    lastSuccessfulReconcile: result.archiveLastSuccessfulReconcile ?? null,
    hookLastSeenAt: result.archiveHookLastSeenAt ?? null,
    watcherLastSeenAt: result.archiveWatcherLastSeenAt ?? null,
    serviceInstanceId: result.archiveServiceInstanceId ?? null,
    wake: result.archiveWake ?? null,
    error: result.archiveError ?? null
  };
}

export function managerArchiveStatusToken(status = {}) {
  if (!status.enabled) return 'dim';
  if (!status.available || status.error || status.syncState === 'STALE') return 'error';
  if (status.syncState === 'READY') return 'live';
  if (status.syncState === 'ARCHIVED') return 'session';
  return 'pressure';
}

export function managerArchiveBadge(status = {}) {
  if (!status.enabled) return 'INDEX OFF · JSONL';
  if (!status.available) return `INDEX ! FALLBACK${status.error ? ' · DB ERROR' : ''}`;
  const state = status.syncState ?? (status.scanComplete ? 'UNKNOWN' : 'VERIFYING');
  const dot = state === 'READY' ? '●' : state === 'STALE' ? '!' : '○';
  const service = status.serviceInstanceId
    ? 'svc:on'
    : status.wake?.running || status.wake?.started
      ? 'svc:wake'
      : 'svc:idle';
  const pending = status.pendingFileCount > 0 || status.pendingByteCount > 0
    ? ` · ${status.pendingFileCount}f/${fmtBytes(status.pendingByteCount)}`
    : '';
  return `INDEX ${dot} ${state} · ${service}${pending}`;
}

export function managerSelectedArchiveBadge(row) {
  if (!row?.archiveSyncState) return null;
  const origin = row.archiveBacked ? 'SQLITE' : 'JSONL';
  return `SELECTED INDEX ${row.archiveSyncState} · ${origin}`;
}
