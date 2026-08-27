import { ARCHIVE_PARSER_VERSION } from './constants.js';

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function timestamp(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function ingestRow(row) {
  if (!row) return null;
  return {
    sessionId: row.session_id ?? null,
    sourcePath: row.source_path,
    fileIdentity: row.file_identity ?? null,
    committedOffset: integer(row.committed_offset, 0),
    observedFileSize: integer(row.observed_file_size, 0),
    sourceMtime: timestamp(row.source_mtime, null),
    parserVersion: integer(row.parser_version, 0),
    lastSuccessAt: timestamp(row.last_success_at, null),
    lastError: row.last_error ?? null
  };
}

function healthRow(row) {
  if (!row) return null;
  return {
    schemaVersion: integer(row.schema_version, 0),
    lastSuccessfulReconcile: timestamp(row.last_successful_reconcile, null),
    lastSeenSourceScan: timestamp(row.last_seen_source_scan, null),
    reconcileGeneration: integer(row.reconcile_generation, 0),
    pendingFileCount: integer(row.pending_file_count, 0),
    pendingByteCount: integer(row.pending_byte_count, 0),
    failedFileCount: integer(row.failed_file_count, 0),
    hookLastSeenAt: timestamp(row.hook_last_seen_at, null),
    watcherLastSeenAt: timestamp(row.watcher_last_seen_at, null),
    serviceInstanceId: row.service_instance_id ?? null,
    archiveCreatedAt: timestamp(row.archive_created_at, null)
  };
}

function sameTimestamp(left, right) {
  const a = timestamp(left, null);
  const b = timestamp(right, null);
  return a === b;
}

export function needsArchiveSourceReconcile(source, ingest, {
  parserVersion = ARCHIVE_PARSER_VERSION
} = {}) {
  if (!source) return Boolean(ingest);
  if (!ingest) return true;
  if (ingest.lastError) return true;
  if (ingest.parserVersion !== parserVersion) return true;
  if (ingest.fileIdentity && source.fileIdentity && ingest.fileIdentity !== source.fileIdentity) return true;
  if (integer(ingest.committedOffset, 0) !== integer(source.size, 0)) return true;
  if (!sameTimestamp(ingest.sourceMtime, source.mtimeMs)) return true;
  return false;
}

export class ArchiveHealthStore {
  constructor(repository, { now = () => Date.now() } = {}) {
    if (!repository?.db?.prepare) throw new TypeError('ArchiveHealthStore requires an initialized ArchiveRepository');
    this.repository = repository;
    this.db = repository.db;
    this.now = now;
  }

  getHealth() {
    return healthRow(this.db.prepare(`
      SELECT m.*,
        (SELECT COUNT(*) FROM ingest_state WHERE last_error IS NOT NULL) AS failed_file_count
      FROM archive_meta m
      WHERE singleton_id = 1
    `).get());
  }

  markServiceStarted(instanceId) {
    if (!instanceId) throw new Error('archive service instanceId is required');
    this.db.prepare('UPDATE archive_meta SET service_instance_id = ? WHERE singleton_id = 1').run(String(instanceId));
    return this.getHealth();
  }

  markServiceStopped(instanceId) {
    if (!instanceId) return { cleared: false, health: this.getHealth() };
    const result = this.db.prepare('UPDATE archive_meta SET service_instance_id = NULL WHERE singleton_id = 1 AND service_instance_id = ?').run(String(instanceId));
    return { cleared: Number(result?.changes ?? 0) > 0, health: this.getHealth() };
  }

  markWatcherSeen({ nowMs = this.now() } = {}) {
    const atMs = timestamp(nowMs, Date.now());
    this.db.prepare('UPDATE archive_meta SET watcher_last_seen_at = ? WHERE singleton_id = 1').run(atMs);
    return this.getHealth();
  }

  markHookSeen({ nowMs = this.now() } = {}) {
    const atMs = timestamp(nowMs, Date.now());
    this.db.prepare('UPDATE archive_meta SET hook_last_seen_at = ? WHERE singleton_id = 1').run(atMs);
    return this.getHealth();
  }

  beginGeneration({ sourceCount = 0, nowMs = this.now() } = {}) {
    const atMs = timestamp(nowMs, Date.now());
    const count = integer(sourceCount, 0);
    this.db.prepare(`
      UPDATE archive_meta SET
        reconcile_generation = reconcile_generation + 1,
        last_seen_source_scan = ?,
        pending_file_count = ?
      WHERE singleton_id = 1
    `).run(atMs, count);
    return this.getHealth()?.reconcileGeneration ?? 0;
  }

  finishGeneration({
    generation,
    pendingFileCount = 0,
    pendingByteCount = 0,
    success = true,
    nowMs = this.now()
  } = {}) {
    const atMs = timestamp(nowMs, Date.now());
    const result = this.db.prepare(`
      UPDATE archive_meta SET
        pending_file_count = ?,
        pending_byte_count = ?,
        last_successful_reconcile = CASE WHEN ? = 1 THEN ? ELSE last_successful_reconcile END
      WHERE singleton_id = 1 AND reconcile_generation = ?
    `).run(
      integer(pendingFileCount, 0),
      integer(pendingByteCount, 0),
      success ? 1 : 0,
      atMs,
      integer(generation, 0)
    );
    return { applied: Number(result?.changes ?? 0) > 0, health: this.getHealth() };
  }

  listTrackedRawSources() {
    return this.db.prepare(`
      SELECT i.*
      FROM ingest_state i
      LEFT JOIN sessions s ON s.session_id = i.session_id
      WHERE i.session_id IS NULL OR s.session_id IS NULL OR s.raw_source_exists != 0
      ORDER BY COALESCE(i.last_success_at, 0) ASC, i.source_path ASC
    `).all().map(ingestRow);
  }

  recordIngestError({
    sourcePath,
    source = null,
    error,
    parserVersion = ARCHIVE_PARSER_VERSION
  } = {}) {
    if (!sourcePath) return null;
    const detail = error?.message ?? String(error ?? 'archive ingest failed');
    const existing = this.repository.getIngestState(sourcePath);
    const observedSize = integer(source?.size, existing?.observedFileSize ?? 0);
    const sourceMtime = timestamp(source?.mtimeMs, existing?.sourceMtime ?? null);

    if (existing) {
      this.db.prepare(`
        UPDATE ingest_state SET
          observed_file_size = ?,
          source_mtime = ?,
          last_error = ?
        WHERE source_path = ?
      `).run(observedSize, sourceMtime, detail, sourcePath);
    } else {
      this.db.prepare(`
        INSERT INTO ingest_state
          (source_path, session_id, file_identity, committed_offset, observed_file_size, source_mtime, parser_version, last_success_at, last_error)
        VALUES (?, NULL, ?, 0, ?, ?, ?, NULL, ?)
      `).run(sourcePath, source?.fileIdentity ?? null, observedSize, sourceMtime, parserVersion, detail);
    }
    return this.repository.getIngestState(sourcePath);
  }

  summarizePending(sources = [], {
    parserVersion = ARCHIVE_PARSER_VERSION
  } = {}) {
    const present = new Set();
    let pendingFileCount = 0;
    let pendingByteCount = 0;

    for (const source of sources) {
      if (!source?.filePath) continue;
      present.add(source.filePath);
      const ingest = this.repository.getIngestState(source.filePath);
      if (!needsArchiveSourceReconcile(source, ingest, { parserVersion })) continue;
      pendingFileCount += 1;
      const committed = integer(ingest?.committedOffset, 0);
      pendingByteCount += Math.max(0, integer(source.size, 0) - committed);
    }

    for (const tracked of this.listTrackedRawSources()) {
      if (!present.has(tracked.sourcePath)) pendingFileCount += 1;
    }

    return { pendingFileCount, pendingByteCount };
  }
}
