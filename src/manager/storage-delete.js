import { deleteArchiveSessions } from '../archive/maintenance.js';
import { deleteSelectedSessions } from './delete-safety.js';

export const MANAGER_DELETE_SCOPE = Object.freeze({
  RAW: 'raw',
  ARCHIVE: 'archive',
  EVERYTHING: 'everything'
});

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
  const mode = Object.values(MANAGER_DELETE_SCOPE).includes(scope) ? scope : MANAGER_DELETE_SCOPE.RAW;
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
    const archiveRows = selected.filter((row) => row?.archiveBacked === true && row?.threadId);
    report.archive = deleteArchive(archiveRows, { suppressRawSources: true });
    report.deletedIds = report.archive.deleted.map((item) => item.id);
    report.rejected.push(...report.archive.rejected);
    report.errors.push(...report.archive.errors);
  } else {
    const rawIds = new Set(selected.filter((row) => row?.filePath).map((row) => row.id));
    report.raw = deleteRaw(rows, rawIds, { sessionsPath, fsRef, processEvidence });
    report.rejected.push(...report.raw.rejected);
    report.errors.push(...report.raw.errors);
    const rawDeletedIds = new Set(report.raw.deleted.map((item) => item.id));

    if (mode === MANAGER_DELETE_SCOPE.RAW) {
      report.deletedIds = [...rawDeletedIds];
    } else {
      // Full delete is deliberately ordered raw first. Archive data is only removed
      // for rows whose raw source was removed successfully, so a raw failure can
      // never destroy the only remaining archived evidence.
      const archiveRows = selected.filter((row) => rawDeletedIds.has(row.id) && row?.archiveBacked === true && row?.threadId);
      report.archive = deleteArchive(archiveRows, {
        reason: 'user-delete-everything',
        suppressRawSources: false
      });
      const archiveDeleted = new Set(report.archive.deleted.map((item) => item.id));
      for (const id of rawDeletedIds) {
        const row = selected.find((item) => item.id === id);
        if (!row?.archiveBacked || archiveDeleted.has(id)) report.deletedIds.push(id);
      }
      report.rejected.push(...report.archive.rejected);
      report.errors.push(...report.archive.errors);
    }
  }

  report.ok = report.deletedIds.length === report.requested && report.rejected.length === 0 && report.errors.length === 0;
  report.partial = report.deletedIds.length > 0 && !report.ok;
  return report;
}
