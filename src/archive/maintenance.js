import fs from 'node:fs';
import path from 'node:path';
import { openArchiveDatabase } from './database.js';
import { installArchiveHooks } from './hook-config.js';
import { kickArchiveService } from './integration.js';

function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const value = fn();
    db.exec('COMMIT;');
    return value;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw error;
  }
}

function rowIdentity(row) {
  return {
    sessionId: row?.threadId ?? row?.sessionId ?? null,
    sourcePath: row?.filePath ?? row?.sourcePath ?? null,
    rawSourceExists: row?.rawSourceExists !== false && Boolean(row?.filePath ?? row?.sourcePath)
  };
}

export function deleteArchiveSessions(rows = [], {
  openDatabase = openArchiveDatabase,
  now = () => Date.now(),
  reason = 'user-delete-archive'
} = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const report = { requested: sourceRows.length, deleted: [], rejected: [], errors: [] };
  if (!sourceRows.length) return { ...report, ok: true, partial: false };

  let opened = null;
  try {
    opened = openDatabase();
    const db = opened.repository.db;
    transaction(db, () => {
      const findIngest = db.prepare('SELECT * FROM ingest_state WHERE source_path = ?');
      const deleteSession = db.prepare('DELETE FROM sessions WHERE session_id = ?');
      const deleteIngestBySession = db.prepare('DELETE FROM ingest_state WHERE session_id = ?');
      const deleteIngestByPath = db.prepare('DELETE FROM ingest_state WHERE source_path = ?');
      const suppress = db.prepare(`
        INSERT INTO archive_suppressions (source_path, session_id, file_identity, suppressed_at, reason)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_path) DO UPDATE SET
          session_id = excluded.session_id,
          file_identity = excluded.file_identity,
          suppressed_at = excluded.suppressed_at,
          reason = excluded.reason
      `);

      for (const row of sourceRows) {
        const identity = rowIdentity(row);
        if (!identity.sessionId) {
          report.rejected.push({ id: row?.id ?? null, reason: 'missing-session-id' });
          continue;
        }
        try {
          const ingest = identity.sourcePath ? findIngest.get(identity.sourcePath) : null;
          const result = deleteSession.run(String(identity.sessionId));
          if (Number(result?.changes ?? 0) === 0) {
            report.rejected.push({ id: row?.id ?? identity.sessionId, reason: 'archive-session-not-found' });
            continue;
          }
          deleteIngestBySession.run(String(identity.sessionId));
          if (identity.sourcePath) deleteIngestByPath.run(String(identity.sourcePath));
          if (identity.rawSourceExists && identity.sourcePath) {
            suppress.run(
              String(identity.sourcePath),
              String(identity.sessionId),
              ingest?.file_identity ?? null,
              Math.trunc(Number(now())),
              String(reason)
            );
          }
          report.deleted.push({
            id: row?.id ?? identity.sessionId,
            sessionId: String(identity.sessionId),
            sourcePath: identity.sourcePath,
            suppressed: Boolean(identity.rawSourceExists && identity.sourcePath)
          });
        } catch (error) {
          report.errors.push({ id: row?.id ?? identity.sessionId, reason: 'archive-delete-failed', error: error?.message ?? String(error) });
        }
      }
    });
  } catch (error) {
    if (!report.errors.length) report.errors.push({ id: null, reason: 'archive-open-failed', error: error?.message ?? String(error) });
  } finally {
    try { opened?.close?.(); } catch {}
  }

  report.ok = report.deleted.length === report.requested && report.rejected.length === 0 && report.errors.length === 0;
  report.partial = report.deleted.length > 0 && !report.ok;
  return report;
}

export function clearArchive({
  openDatabase = openArchiveDatabase,
  now = () => Date.now(),
  preserveSuppressions = false
} = {}) {
  let opened = null;
  try {
    opened = openDatabase();
    const db = opened.repository.db;
    const result = transaction(db, () => {
      const sessionCount = Number(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()?.count ?? 0);
      if (!preserveSuppressions) db.prepare('DELETE FROM archive_suppressions').run();
      db.prepare('DELETE FROM ingest_state').run();
      db.prepare('DELETE FROM sessions').run();
      db.prepare(`
        UPDATE archive_meta SET
          last_successful_reconcile = NULL,
          last_seen_source_scan = NULL,
          reconcile_generation = 0,
          pending_file_count = 0,
          pending_byte_count = 0
        WHERE singleton_id = 1
      `).run();
      return { cleared: sessionCount, atMs: Math.trunc(Number(now())) };
    });
    return { ok: true, ...result, error: null };
  } catch (error) {
    return { ok: false, cleared: 0, error: error?.message ?? String(error) };
  } finally {
    try { opened?.close?.(); } catch {}
  }
}

export function compactArchive({ openDatabase = openArchiveDatabase } = {}) {
  let opened = null;
  try {
    opened = openDatabase();
    opened.repository.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    opened.repository.db.exec('VACUUM;');
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  } finally {
    try { opened?.close?.(); } catch {}
  }
}

export function repairArchiveHook({ installHooks = installArchiveHooks } = {}) {
  try {
    const hooks = installHooks();
    return { ok: hooks?.installed === true, hooks, error: hooks?.error ?? null };
  } catch (error) {
    return { ok: false, hooks: null, error: error?.message ?? String(error) };
  }
}

export function reconcileArchiveNow(config, { kickService = kickArchiveService } = {}) {
  try {
    const service = kickService(config);
    return { ok: service?.error == null, service, error: service?.error ?? null };
  } catch (error) {
    return { ok: false, service: null, error: error?.message ?? String(error) };
  }
}

export function archiveDatabaseSize(filePath, { fsRef = fs } = {}) {
  if (!filePath) return null;
  try {
    const stat = fsRef.statSync(path.resolve(filePath));
    return Number.isFinite(Number(stat?.size)) ? Number(stat.size) : null;
  } catch {
    return null;
  }
}
