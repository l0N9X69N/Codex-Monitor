import { deleteArchiveSessions } from '../archive/maintenance.js';
import { deleteSelectedSessions } from './delete-safety.js';

export const MANAGER_DELETE_SCOPE = Object.freeze({
  RAW: 'raw',
  ARCHIVE: 'archive',
  EVERYTHING: 'everything'
});

const DELETE_SCOPES = Object.freeze(Object.values(MANAGER_DELETE_SCOPE));

export function nextManagerDeleteScope(scope = MANAGER_DELETE_SCOPE.RAW) {
  const index = DELETE_SCOPES.indexOf(String(scope));
  return DELETE_SCOPES[(index < 0 ? 0 : index + 1) % DELETE_SCOPES.length];
}

function canDeleteArchive(row) {
  return row?.archiveBacked === true && Boolean(row?.threadId);
}

export function managerDeleteRowEligible(row, scope = MANAGER_DELETE_SCOPE.RAW) {
  if (!row || row.state === 'LIVE') return false;
  if (scope === MANAGER_DELETE_SCOPE.ARCHIVE) return canDeleteArchive(row);
  if (scope === MANAGER_DELETE_SCOPE.EVERYTHING) return Boolean(row.filePath) || canDeleteArchive(row);
  return row.state === 'ENDED' && Boolean(row.filePath);
}

function selectedRows(rows, selectedIds) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(Array.isArray(selectedIds) ? selectedIds : []);
  return (Array.isArray(rows) ? rows : []).filter((row) => ids.has(row?.id));
}

export function deleteManagerSessions(rows = [], selectedIds = [], {
  scope = MANAGER_DELETE_SCOPE.RAW,
  sessionsPath,
  fsRef,
  processEvidence = null,
  deleteRaw = deleteSelectedSessions,
  deleteArchive = deleteArchiveSessions
} = {}) {
  const mode = DELETE_SCOPES.includes(scope) ? scope : MANAGER_DELETE_SCOPE.RAW;
  const selected = selectedRows(rows, selectedIds);
  const report = {
    scope: mode,
    requested: selected.length,
    raw: null,
    archive: null,
    deletedIds: [],
    rejected: [],
    errors: []
  };

  if (mode === MANAGER_DELETE_SCOPE.ARCHIVE) {
    const archiveRows = selected.filter(canDeleteArchive);
    for (const row of selected) {
      if (!canDeleteArchive(row)) report.rejected.push({ id: row?.id ?? null, reason: 'archive-not-available' });
    }
    report.archive = archiveRows.length
      ? deleteArchive(archiveRows, { suppressRawSources: true })
      : { requested: 0, deleted: [], rejected: [], errors: [], ok: true, partial: false };
    report.deletedIds = report.archive.deleted.map((item) => item.id);
    report.rejected.push(...report.archive.rejected);
    report.errors.push(...report.archive.errors);
  } else {
    const withRaw = selected.filter((row) => Boolean(row?.filePath));
    const rawIds = new Set(withRaw.map((row) => row.id));
    report.raw = rawIds.size
      ? deleteRaw(rows, rawIds, { sessionsPath, fsRef, processEvidence })
      : { requested: 0, deleted: [], rejected: [], errors: [], ok: true, partial: false };
    report.rejected.push(...report.raw.rejected);
    report.errors.push(...report.raw.errors);
    const rawDeletedIds = new Set(report.raw.deleted.map((item) => item.id));

    if (mode === MANAGER_DELETE_SCOPE.RAW) {
      report.deletedIds = [...rawDeletedIds];
      for (const row of selected) {
        if (!row?.filePath) report.rejected.push({ id: row?.id ?? null, reason: 'raw-source-unavailable' });
      }
    } else {
      const archiveOnlyRows = selected.filter((row) => !row?.filePath && canDeleteArchive(row));
      const archiveAfterRaw = selected.filter((row) => rawDeletedIds.has(row.id) && canDeleteArchive(row));
      const archiveRows = [...archiveOnlyRows, ...archiveAfterRaw];
      report.archive = archiveRows.length
        ? deleteArchive(archiveRows, { reason: 'user-delete-everything', suppressRawSources: false })
        : { requested: 0, deleted: [], rejected: [], errors: [], ok: true, partial: false };
      const archiveDeleted = new Set(report.archive.deleted.map((item) => item.id));

      for (const row of selected) {
        if (!row?.filePath) {
          if (!canDeleteArchive(row)) report.rejected.push({ id: row?.id ?? null, reason: 'nothing-to-delete' });
          else if (archiveDeleted.has(row.id)) report.deletedIds.push(row.id);
          continue;
        }
        if (!rawDeletedIds.has(row.id)) continue;
        if (!canDeleteArchive(row) || archiveDeleted.has(row.id)) report.deletedIds.push(row.id);
      }
      report.rejected.push(...report.archive.rejected);
      report.errors.push(...report.archive.errors);
    }
  }

  report.rawDeletedCount = Number(report.raw?.deleted?.length ?? 0);
  report.archiveDeletedCount = Number(report.archive?.deleted?.length ?? 0);
  report.ok = report.deletedIds.length === report.requested && report.rejected.length === 0 && report.errors.length === 0;
  report.partial = (report.rawDeletedCount + report.archiveDeletedCount) > 0 && !report.ok;
  return report;
}
