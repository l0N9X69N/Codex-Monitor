import { getArchiveDatabasePath, openArchiveDatabaseReadOnly } from '../archive/database.js';
import { inspectArchiveHooks } from '../archive/hook-config.js';
import {
  archiveDatabaseSize,
  clearArchive,
  compactArchive,
  reconcileArchiveNow,
  repairArchiveHook
} from '../archive/maintenance.js';
import { getArchiveServiceStatus } from '../archive/service-control.js';

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function fmtBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.trunc(bytes)} B`;
}

function ageLabel(value, nowMs) {
  const at = Number(value);
  if (!Number.isFinite(at) || at <= 0) return '--';
  const age = Math.max(0, Number(nowMs) - at);
  if (age < 1000) return 'now';
  if (age < 60_000) return `${Math.floor(age / 1000)}s ago`;
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  return `${Math.floor(age / 3_600_000)}h ago`;
}

export function readArchiveConfigHealth({
  openDatabase = openArchiveDatabaseReadOnly,
  databasePath = getArchiveDatabasePath,
  readServiceStatus = getArchiveServiceStatus,
  inspectHooks = inspectArchiveHooks,
  fileSize = archiveDatabaseSize,
  now = () => Date.now()
} = {}) {
  const atMs = Number(now());
  let opened = null;
  let dbError = null;
  let health = null;
  let sessions = 0;
  let suppressions = 0;
  let failedFiles = 0;
  let dbPath = null;
  try {
    dbPath = databasePath();
    opened = openDatabase();
    health = opened.repository.db.prepare('SELECT * FROM archive_meta WHERE singleton_id = 1').get() ?? null;
    sessions = Number(opened.repository.db.prepare('SELECT COUNT(*) AS count FROM sessions').get()?.count ?? 0);
    failedFiles = Number(opened.repository.db.prepare('SELECT COUNT(*) AS count FROM ingest_state WHERE last_error IS NOT NULL').get()?.count ?? 0);
    try {
      suppressions = Number(opened.repository.db.prepare('SELECT COUNT(*) AS count FROM archive_suppressions').get()?.count ?? 0);
    } catch {}
  } catch (error) {
    dbError = error?.message ?? String(error);
  } finally {
    try { opened?.close?.(); } catch {}
  }

  let service = null;
  try { service = readServiceStatus(); } catch (error) { service = { running: false, error: error?.message ?? String(error) }; }
  let hooks = null;
  try { hooks = inspectHooks(); } catch (error) { hooks = { installed: false, complete: false, error: error?.message ?? String(error) }; }
  const pendingFiles = integer(health?.pending_file_count, 0);
  const pendingBytes = integer(health?.pending_byte_count, 0);
  return {
    atMs,
    sqliteHealthy: dbError == null && Boolean(health),
    sqliteError: dbError,
    databasePath: dbPath,
    databaseBytes: dbPath ? fileSize(dbPath) : null,
    sessions,
    suppressions,
    failedFiles: integer(failedFiles, 0),
    serviceRunning: service?.running === true,
    serviceOwner: service?.owner ?? null,
    serviceError: service?.error ?? null,
    hookInstalled: hooks?.installed === true,
    hookComplete: hooks?.complete === true,
    hookError: hooks?.error ?? null,
    watcherLastSeenAt: health?.watcher_last_seen_at ?? null,
    lastReconcileAt: health?.last_successful_reconcile ?? null,
    pendingFiles,
    pendingBytes,
    syncLabel: dbError
      ? 'DB ERROR'
      : failedFiles > 0
        ? 'ATTENTION'
        : pendingFiles > 0 || pendingBytes > 0
          ? 'CATCHING UP'
          : 'READY',
    display: {
      database: fmtBytes(dbPath ? fileSize(dbPath) : null),
      lastReconcile: ageLabel(health?.last_successful_reconcile, atMs),
      watcher: health?.watcher_last_seen_at ? ageLabel(health.watcher_last_seen_at, atMs) : '--',
      pendingBytes: fmtBytes(pendingBytes)
    }
  };
}

export class ArchiveConfigPanel {
  constructor({
    readHealth = readArchiveConfigHealth,
    reconcile = reconcileArchiveNow,
    compact = compactArchive,
    repairHook = repairArchiveHook,
    clear = clearArchive
  } = {}) {
    this.readHealth = readHealth;
    this.reconcile = reconcile;
    this.compact = compact;
    this.repairHook = repairHook;
    this.clear = clear;
    this.health = null;
    this.pendingConfirmation = null;
  }

  refresh() {
    try { this.health = this.readHealth(); } catch (error) { this.health = { sqliteHealthy: false, sqliteError: error?.message ?? String(error) }; }
    return this.health;
  }

  rows(config) {
    const health = this.health ?? this.refresh();
    const enabled = config?.archive?.enabled === true;
    return [
      { id: 'archive:enabled', label: 'Archive', value: enabled ? 'On' : 'Off', editable: true },
      { id: 'archive:health:service', label: 'Service', value: health.serviceRunning ? 'Running' : 'Idle', editable: false },
      { id: 'archive:health:hook', label: 'Codex Hook', value: health.hookComplete ? 'Installed' : health.hookInstalled ? 'Partial' : 'Missing', editable: false },
      { id: 'archive:health:watcher', label: 'Watcher', value: health.display?.watcher ?? '--', editable: false },
      { id: 'archive:health:sqlite', label: 'SQLite', value: health.sqliteHealthy ? 'Healthy' : 'Unavailable', editable: false },
      { id: 'archive:health:sync', label: 'Sync', value: enabled ? (health.syncLabel ?? '--') : 'Disabled', editable: false },
      { id: 'archive:health:database', label: 'Database', value: health.display?.database ?? '--', editable: false },
      { id: 'archive:health:sessions', label: 'Archived sessions', value: String(health.sessions ?? 0), editable: false },
      { id: 'archive:health:suppressed', label: 'Suppressed raw sources', value: String(health.suppressions ?? 0), editable: false },
      { id: 'archive:health:failed-files', label: 'Failed files', value: String(health.failedFiles ?? 0), editable: false },
      { id: 'archive:health:last-reconcile', label: 'Last reconcile', value: health.display?.lastReconcile ?? '--', editable: false },
      { id: 'archive:health:pending-files', label: 'Pending files', value: String(health.pendingFiles ?? 0), editable: false },
      { id: 'archive:health:pending-bytes', label: 'Pending bytes', value: health.display?.pendingBytes ?? '--', editable: false },
      { id: 'archive:retention', label: 'Retention', value: 'Forever', editable: false },
      { id: 'archive:size', label: 'Size limit', value: config?.archive?.sizeLimitBytes == null ? 'Unlimited' : String(config.archive.sizeLimitBytes), editable: false },
      { id: 'archive:action:reconcile', label: 'Action · Reconcile Now', value: 'Run', editable: true, action: true },
      { id: 'archive:action:compact', label: 'Action · Compact Archive', value: 'Run', editable: true, action: true },
      { id: 'archive:action:repair-hook', label: 'Action · Repair Hook', value: 'Run', editable: true, action: true },
      { id: 'archive:action:clear', label: 'Action · Clear Archive', value: this.pendingConfirmation === 'clear' ? 'CONFIRM AGAIN' : 'Run', editable: true, action: true }
    ];
  }

  run(action, config) {
    const name = String(action ?? '').replace(/^archive:action:/, '');
    if (name !== 'clear') this.pendingConfirmation = null;
    if (name === 'clear' && this.pendingConfirmation !== 'clear') {
      this.pendingConfirmation = 'clear';
      return { ok: false, pending: true, action: name, status: 'Clear Archive armed · press Enter/Space again to confirm' };
    }

    let result;
    if (name === 'reconcile') result = this.reconcile(config);
    else if (name === 'compact') result = this.compact();
    else if (name === 'repair-hook') result = this.repairHook();
    else if (name === 'clear') {
      this.pendingConfirmation = null;
      result = this.clear();
    } else return { ok: false, pending: false, action: name, status: 'Unknown Archive action' };

    this.refresh();
    const ok = result?.ok === true;
    const detail = result?.error ?? result?.reason ?? (ok ? 'done' : 'failed');
    return { ok, pending: false, action: name, result, status: `${name.replaceAll('-', ' ')} · ${detail}` };
  }

  cancelConfirmation() {
    this.pendingConfirmation = null;
  }
}
