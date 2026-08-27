import path from 'node:path';
import { normalizePlatformPath } from '../platform/common.js';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pathKey(value) {
  if (!value) return null;
  return normalizePlatformPath(value) ?? path.resolve(String(value));
}

function mergeRecent(base = []) {
  const values = [...(Array.isArray(base) ? base : [])];
  values.sort((left, right) => Number(left?.atMs ?? 0) - Number(right?.atMs ?? 0));
  return values.slice(-8);
}

function archiveAuthoritative(archived) {
  return Boolean(archived?.archiveBacked && archived?.archiveSyncState !== 'UNINDEXED' && archived?.archiveSyncState !== 'STALE');
}

function effectiveArchiveSyncState(raw, archived) {
  if (!archiveAuthoritative(archived)) return archived?.archiveSyncState ?? null;
  const rawSize = numberOrNull(raw?.fileSizeBytes);
  const committedOffset = numberOrNull(archived?.archiveCommittedOffset);
  if (rawSize != null && committedOffset != null && rawSize > committedOffset) return 'CATCHING_UP';
  return archived?.archiveSyncState ?? null;
}

export function mergeManagerArchiveRows(rawRows = [], archiveRows = []) {
  const archiveByPath = new Map();
  const archiveOnly = [];
  for (const row of Array.isArray(archiveRows) ? archiveRows : []) {
    const key = pathKey(row?.filePath ?? row?.sourcePath);
    if (key && row.rawSourceExists !== false) archiveByPath.set(key, row);
    else archiveOnly.push(row);
  }

  const merged = [];
  const consumed = new Set();
  for (const raw of Array.isArray(rawRows) ? rawRows : []) {
    const key = pathKey(raw?.filePath);
    const archived = key ? archiveByPath.get(key) : null;
    if (!archived) {
      merged.push(raw);
      continue;
    }

    consumed.add(key);
    if (!archiveAuthoritative(archived)) {
      merged.push({
        ...archived,
        ...raw,
        sourcePath: archived.sourcePath ?? raw.filePath ?? null,
        archiveBacked: archived.archiveBacked === true,
        archiveVerified: archived.archiveVerified,
        archiveSyncState: archived.archiveSyncState,
        archiveCommittedOffset: archived.archiveCommittedOffset,
        archiveObservedFileSize: archived.archiveObservedFileSize,
        archiveParserVersion: archived.archiveParserVersion,
        archiveLastSuccessAt: archived.archiveLastSuccessAt,
        archiveLastError: archived.archiveLastError
      });
      continue;
    }

    const effectiveSyncState = effectiveArchiveSyncState(raw, archived);
    const archiveVerified = effectiveSyncState === 'READY' ? archived.archiveVerified : false;
    merged.push({
      ...archived,
      id: raw.id ?? archived.id,
      filePath: raw.filePath ?? archived.filePath,
      sourcePath: archived.sourcePath ?? raw.filePath ?? null,
      name: raw.name ?? archived.name,
      state: raw.state ?? archived.state,
      threadId: archived.threadId ?? raw.threadId,
      project: archived.project && archived.project !== 'UNKNOWN'
        ? archived.project
        : (raw.project ?? archived.project),
      cwd: archived.cwd ?? raw.cwd,
      model: archived.model ?? raw.model,
      reasoning: archived.reasoning ?? raw.reasoning,
      startedAtMs: archived.startedAtMs ?? raw.startedAtMs,
      elapsedMs: raw.elapsedMs ?? archived.elapsedMs,
      tokens: { ...(archived.tokens ?? {}) },
      turnCount: archived.turnCount,
      toolCount: archived.toolCount,
      agentSpawnCount: archived.agentSpawnCount ?? raw.agentSpawnCount ?? null,
      errorCount: archived.errorCount ?? 0,
      retryCount: archived.retryCount ?? 0,
      compactionCount: archived.compactionCount ?? 0,
      countsComplete: archived.countsComplete !== false,
      observedTurnCount: archived.observedTurnCount ?? archived.turnCount ?? 0,
      observedToolCount: archived.observedToolCount ?? archived.toolCount ?? 0,
      observedAgentSpawnCount: archived.observedAgentSpawnCount ?? archived.agentSpawnCount ?? 0,
      lastTurnCompletedAtMs: archived.lastTurnCompletedAtMs ?? raw.lastTurnCompletedAtMs ?? null,
      lastTurnDurationMs: archived.lastTurnDurationMs ?? raw.lastTurnDurationMs ?? null,
      lastActivityAtMs: Math.max(
        numberOrNull(raw.lastActivityAtMs) ?? 0,
        numberOrNull(archived.lastActivityAtMs) ?? 0
      ) || null,
      lastActivitySource: archived.archiveOverlayOffset != null ? 'archive+jsonl-delta' : archived.lastActivitySource,
      recentErrors: mergeRecent(archived.recentErrors),
      recentRetries: mergeRecent(archived.recentRetries),
      recentCompactions: mergeRecent(archived.recentCompactions),
      fileSizeBytes: raw.fileSizeBytes ?? archived.fileSizeBytes,
      modifiedAtMs: raw.modifiedAtMs ?? archived.modifiedAtMs,
      rawSourceExists: true,
      archiveBacked: true,
      archiveVerified,
      archiveSyncState: effectiveSyncState,
      observationGap: Boolean(archived.observationGap)
    });
  }

  for (const [key, row] of archiveByPath) if (!consumed.has(key)) merged.push(row);
  merged.push(...archiveOnly.filter(Boolean));
  merged.sort((left, right) => Number(right?.lastActivityAtMs ?? right?.modifiedAtMs ?? 0) - Number(left?.lastActivityAtMs ?? left?.modifiedAtMs ?? 0));
  return merged;
}

export { pathKey as managerArchiveRowPathKey };
