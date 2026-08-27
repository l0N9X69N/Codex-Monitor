import path from 'node:path';
import { ARCHIVE_PARSER_VERSION, ARCHIVE_SYNC_STATE } from '../archive/constants.js';
import { openArchiveDatabaseReadOnly } from '../archive/database.js';
import { ArchiveHealthStore } from '../archive/health-store.js';
import { scanArchiveSources } from '../archive/source-scan.js';
import { classifyArchiveSyncState } from '../archive/sync-state.js';
import { normalizePlatformPath } from '../platform/common.js';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampOrNull(value) {
  const number = numberOrNull(value);
  return number == null || number <= 0 ? null : Math.trunc(number);
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function pathKey(value) {
  if (!value) return null;
  return normalizePlatformPath(value) ?? path.resolve(String(value));
}

function ingestRow(row) {
  if (!row) return null;
  return {
    sessionId: row.session_id ?? null,
    sourcePath: row.source_path ?? null,
    fileIdentity: row.file_identity ?? null,
    committedOffset: integer(row.committed_offset, 0),
    observedFileSize: integer(row.observed_file_size, 0),
    sourceMtime: timestampOrNull(row.source_mtime),
    parserVersion: integer(row.parser_version, 0),
    lastSuccessAt: timestampOrNull(row.last_success_at),
    lastError: row.last_error ?? null
  };
}

function archiveSessionRow(row, ingest = null, { verified = false } = {}) {
  const sessionId = String(row.session_id);
  const storedSourcePath = row.source_path ?? ingest?.sourcePath ?? null;
  const rawSourceExists = Number(row.raw_source_exists ?? 1) !== 0;
  const filePath = rawSourceExists ? storedSourcePath : null;
  const state = rawSourceExists ? (row.state ?? 'ENDED') : 'ARCHIVED';
  const startedAtMs = timestampOrNull(row.started_at);
  const endedAtMs = timestampOrNull(row.ended_at);
  const lastActivityAtMs = timestampOrNull(row.last_activity_at) ?? timestampOrNull(row.raw_file_mtime);
  const elapsedMs = startedAtMs != null && state !== 'LIVE' && lastActivityAtMs != null && lastActivityAtMs >= startedAtMs
    ? lastActivityAtMs - startedAtMs
    : null;

  return {
    id: filePath ?? `archive:${sessionId}`,
    filePath,
    sourcePath: storedSourcePath,
    name: filePath ? path.basename(filePath, path.extname(filePath)) : sessionId,
    state,
    threadId: sessionId,
    project: row.project ?? 'UNKNOWN',
    cwd: row.cwd ?? null,
    model: row.model ?? null,
    reasoning: row.reasoning ?? null,
    startedAtMs,
    endedAtMs,
    elapsedMs,
    tokens: {
      input: numberOrNull(row.input_tokens),
      cached: numberOrNull(row.cached_tokens),
      output: numberOrNull(row.output_tokens),
      reasoning: numberOrNull(row.reasoning_tokens),
      contextWindow: null,
      contextUsed: numberOrNull(row.context_current)
    },
    contextPeak: numberOrNull(row.context_peak),
    turnCount: integer(row.turn_count, 0),
    toolCount: integer(row.tool_count, 0),
    errorCount: integer(row.error_count, 0),
    retryCount: integer(row.retry_count, 0),
    compactionCount: integer(row.compaction_count, 0),
    agentSpawnCount: null,
    countsComplete: true,
    observedTurnCount: integer(row.turn_count, 0),
    observedToolCount: integer(row.tool_count, 0),
    observedAgentSpawnCount: 0,
    lastTurnCompletedAtMs: null,
    lastTurnDurationMs: null,
    lastActivityAtMs,
    lastActivitySource: 'archive-sqlite',
    recentErrors: [],
    recentRetries: [],
    recentCompactions: [],
    fileSizeBytes: rawSourceExists ? integer(row.raw_file_size, 0) : null,
    archivedRawFileSizeBytes: integer(row.raw_file_size, 0),
    modifiedAtMs: rawSourceExists ? timestampOrNull(row.raw_file_mtime) : null,
    observationGap: false,
    rawSourceExists,
    archiveBacked: true,
    archiveVerified: verified,
    archiveSyncState: rawSourceExists ? ARCHIVE_SYNC_STATE.CATCHING_UP : ARCHIVE_SYNC_STATE.ARCHIVED,
    archiveCommittedOffset: ingest?.committedOffset ?? 0,
    archiveObservedFileSize: ingest?.observedFileSize ?? 0,
    archiveParserVersion: ingest?.parserVersion ?? 0,
    archiveLastSuccessAt: ingest?.lastSuccessAt ?? null,
    archiveLastError: ingest?.lastError ?? null
  };
}

function provisionalSourceRow(source, ingest, syncState) {
  const filePath = source.filePath;
  return {
    id: filePath,
    filePath,
    sourcePath: filePath,
    name: path.basename(filePath, path.extname(filePath)),
    state: 'UNKNOWN',
    threadId: ingest?.sessionId ?? null,
    project: 'UNKNOWN',
    cwd: null,
    model: null,
    reasoning: null,
    startedAtMs: null,
    endedAtMs: null,
    elapsedMs: null,
    tokens: { input: null, cached: null, output: null, reasoning: null, contextWindow: null, contextUsed: null },
    contextPeak: null,
    turnCount: null,
    toolCount: null,
    errorCount: 0,
    retryCount: 0,
    compactionCount: 0,
    agentSpawnCount: null,
    countsComplete: false,
    observedTurnCount: 0,
    observedToolCount: 0,
    observedAgentSpawnCount: 0,
    lastTurnCompletedAtMs: null,
    lastTurnDurationMs: null,
    lastActivityAtMs: timestampOrNull(source.mtimeMs),
    lastActivitySource: 'file-mtime',
    recentErrors: [],
    recentRetries: [],
    recentCompactions: [],
    fileSizeBytes: integer(source.size, 0),
    archivedRawFileSizeBytes: null,
    modifiedAtMs: timestampOrNull(source.mtimeMs),
    observationGap: false,
    rawSourceExists: true,
    archiveBacked: false,
    archiveVerified: true,
    archiveSyncState: syncState,
    archiveCommittedOffset: ingest?.committedOffset ?? 0,
    archiveObservedFileSize: ingest?.observedFileSize ?? 0,
    archiveParserVersion: ingest?.parserVersion ?? 0,
    archiveLastSuccessAt: ingest?.lastSuccessAt ?? null,
    archiveLastError: ingest?.lastError ?? null
  };
}

function globalSyncState(rows, health, { scanComplete }) {
  if (!scanComplete) return ARCHIVE_SYNC_STATE.CATCHING_UP;
  const states = rows.map((row) => row.archiveSyncState);
  if (states.includes(ARCHIVE_SYNC_STATE.STALE)) return ARCHIVE_SYNC_STATE.STALE;
  if (states.includes(ARCHIVE_SYNC_STATE.UNINDEXED)) return ARCHIVE_SYNC_STATE.UNINDEXED;
  if (states.includes(ARCHIVE_SYNC_STATE.CATCHING_UP)) return ARCHIVE_SYNC_STATE.CATCHING_UP;
  if (integer(health?.pendingFileCount, 0) > 0 || integer(health?.pendingByteCount, 0) > 0) {
    return ARCHIVE_SYNC_STATE.CATCHING_UP;
  }
  return ARCHIVE_SYNC_STATE.READY;
}

function mergeTokens(base = {}, overlay = {}) {
  const result = { ...base };
  for (const key of ['input', 'cached', 'output', 'reasoning', 'contextWindow', 'contextUsed']) {
    if (overlay?.[key] !== null && overlay?.[key] !== undefined) result[key] = overlay[key];
  }
  return result;
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
    merged.push({
      ...archived,
      ...raw,
      id: raw.id ?? archived.id,
      filePath: raw.filePath ?? archived.filePath,
      sourcePath: archived.sourcePath ?? raw.filePath ?? null,
      state: raw.state ?? archived.state,
      threadId: raw.threadId ?? archived.threadId,
      project: raw.project && raw.project !== 'UNKNOWN' ? raw.project : archived.project,
      cwd: raw.cwd ?? archived.cwd,
      model: raw.model ?? archived.model,
      reasoning: raw.reasoning ?? archived.reasoning,
      startedAtMs: raw.startedAtMs ?? archived.startedAtMs,
      elapsedMs: raw.elapsedMs ?? archived.elapsedMs,
      tokens: mergeTokens(archived.tokens, raw.tokens),
      turnCount: raw.turnCount ?? archived.turnCount,
      toolCount: raw.toolCount ?? archived.toolCount,
      errorCount: archived.errorCount ?? raw.errorCount ?? 0,
      retryCount: archived.retryCount ?? raw.retryCount ?? 0,
      compactionCount: archived.compactionCount ?? raw.compactionCount ?? 0,
      countsComplete: Boolean(raw.countsComplete || archived.countsComplete),
      observedTurnCount: raw.observedTurnCount ?? archived.observedTurnCount ?? 0,
      observedToolCount: raw.observedToolCount ?? archived.observedToolCount ?? 0,
      lastActivityAtMs: Math.max(numberOrNull(raw.lastActivityAtMs) ?? 0, numberOrNull(archived.lastActivityAtMs) ?? 0) || null,
      fileSizeBytes: raw.fileSizeBytes ?? archived.fileSizeBytes,
      modifiedAtMs: raw.modifiedAtMs ?? archived.modifiedAtMs,
      rawSourceExists: true,
      archiveBacked: true,
      archiveSyncState: archived.archiveSyncState
    });
  }

  for (const [key, row] of archiveByPath) if (!consumed.has(key)) merged.push(row);
  merged.push(...archiveOnly.filter(Boolean));
  merged.sort((left, right) => Number(right?.lastActivityAtMs ?? right?.modifiedAtMs ?? 0) - Number(left?.lastActivityAtMs ?? left?.modifiedAtMs ?? 0));
  return merged;
}

export class ManagerArchiveIndex {
  constructor({
    config = null,
    sessionsPath = null,
    openDatabase = openArchiveDatabaseReadOnly,
    scanSources = scanArchiveSources,
    HealthStore = ArchiveHealthStore,
    parserVersion = ARCHIVE_PARSER_VERSION
  } = {}) {
    this.config = config;
    this.sessionsPath = sessionsPath;
    this.openDatabase = openDatabase;
    this.scanSources = scanSources;
    this.HealthStore = HealthStore;
    this.parserVersion = parserVersion;
    this.opened = null;
    this.healthStore = null;
    this.lastSnapshot = {
      enabled: config?.archive?.enabled === true,
      available: false,
      sourceScanComplete: false,
      globalSyncState: config?.archive?.enabled === true ? ARCHIVE_SYNC_STATE.CATCHING_UP : null,
      rows: [],
      sourceCount: 0,
      pendingFileCount: 0,
      pendingByteCount: 0,
      health: null,
      error: null
    };
  }

  get enabled() {
    return this.config?.archive?.enabled === true;
  }

  _readRows({ verified = false } = {}) {
    if (!this.opened?.repository?.db?.prepare) return [];
    const db = this.opened.repository.db;
    const ingestRows = db.prepare('SELECT * FROM ingest_state').all().map(ingestRow);
    const ingestBySession = new Map();
    for (const ingest of ingestRows) if (ingest?.sessionId) ingestBySession.set(ingest.sessionId, ingest);
    return db.prepare('SELECT * FROM sessions ORDER BY COALESCE(last_activity_at, raw_file_mtime, 0) DESC, session_id ASC').all()
      .map((row) => archiveSessionRow(row, ingestBySession.get(row.session_id) ?? null, { verified }));
  }

  open() {
    if (!this.enabled) return this.lastSnapshot;
    if (this.opened) return this.lastSnapshot;
    try {
      this.opened = this.openDatabase();
      this.healthStore = new this.HealthStore(this.opened.repository);
      const rows = this._readRows({ verified: false });
      const health = this.healthStore.getHealth();
      this.lastSnapshot = {
        enabled: true,
        available: true,
        sourceScanComplete: false,
        globalSyncState: ARCHIVE_SYNC_STATE.CATCHING_UP,
        rows,
        sourceCount: 0,
        pendingFileCount: integer(health?.pendingFileCount, 0),
        pendingByteCount: integer(health?.pendingByteCount, 0),
        health,
        error: null
      };
    } catch (error) {
      try { this.opened?.close?.(); } catch {}
      this.opened = null;
      this.healthStore = null;
      this.lastSnapshot = {
        ...this.lastSnapshot,
        enabled: true,
        available: false,
        sourceScanComplete: false,
        globalSyncState: ARCHIVE_SYNC_STATE.STALE,
        rows: [],
        error: error?.message ?? String(error)
      };
    }
    return this.lastSnapshot;
  }

  async refresh() {
    if (!this.enabled) return this.lastSnapshot;
    if (!this.opened) this.open();
    if (!this.opened) return this.lastSnapshot;

    try {
      const sources = await this.scanSources(this.sessionsPath);
      const sourceByPath = new Map(sources.map((source) => [pathKey(source.filePath), source]));
      const db = this.opened.repository.db;
      const ingestRows = db.prepare('SELECT * FROM ingest_state').all().map(ingestRow);
      const ingestByPath = new Map(ingestRows.map((ingest) => [pathKey(ingest.sourcePath), ingest]));
      const rows = this._readRows({ verified: true });
      const represented = new Set();
      let pendingFileCount = 0;
      let pendingByteCount = 0;

      for (const row of rows) {
        const key = pathKey(row.sourcePath);
        if (key) represented.add(key);
        const source = key ? sourceByPath.get(key) ?? null : null;
        const ingest = key ? ingestByPath.get(key) ?? null : null;
        const syncState = classifyArchiveSyncState({
          source,
          ingest,
          hasArchiveData: true,
          parserVersion: this.parserVersion,
          scanComplete: true
        });
        row.archiveSyncState = syncState;
        row.archiveVerified = true;
        row.archiveCommittedOffset = ingest?.committedOffset ?? 0;
        row.archiveObservedFileSize = source?.size ?? ingest?.observedFileSize ?? 0;
        row.archiveLastError = ingest?.lastError ?? null;
        if (!source) {
          row.rawSourceExists = false;
          row.filePath = null;
          row.id = `archive:${row.threadId}`;
          row.state = 'ARCHIVED';
          row.fileSizeBytes = null;
          row.modifiedAtMs = null;
        } else {
          row.rawSourceExists = true;
          row.filePath = source.filePath;
          row.id = source.filePath;
          row.fileSizeBytes = integer(source.size, 0);
          row.modifiedAtMs = timestampOrNull(source.mtimeMs);
          if (![ARCHIVE_SYNC_STATE.READY, ARCHIVE_SYNC_STATE.ARCHIVED].includes(syncState)) {
            pendingFileCount += 1;
            pendingByteCount += Math.max(0, integer(source.size, 0) - integer(ingest?.committedOffset, 0));
          }
        }
      }

      for (const source of sources) {
        const key = pathKey(source.filePath);
        if (represented.has(key)) continue;
        const ingest = ingestByPath.get(key) ?? null;
        let syncState = classifyArchiveSyncState({
          source,
          ingest,
          hasArchiveData: false,
          parserVersion: this.parserVersion,
          scanComplete: true
        });
        if (syncState === ARCHIVE_SYNC_STATE.READY && !ingest?.sessionId) syncState = ARCHIVE_SYNC_STATE.STALE;
        rows.push(provisionalSourceRow(source, ingest, syncState));
        if (![ARCHIVE_SYNC_STATE.READY, ARCHIVE_SYNC_STATE.ARCHIVED].includes(syncState)) {
          pendingFileCount += 1;
          pendingByteCount += Math.max(0, integer(source.size, 0) - integer(ingest?.committedOffset, 0));
        }
      }

      rows.sort((left, right) => Number(right?.lastActivityAtMs ?? right?.modifiedAtMs ?? 0) - Number(left?.lastActivityAtMs ?? left?.modifiedAtMs ?? 0));
      const health = this.healthStore.getHealth();
      const effectiveHealth = {
        ...health,
        pendingFileCount: Math.max(pendingFileCount, integer(health?.pendingFileCount, 0)),
        pendingByteCount: Math.max(pendingByteCount, integer(health?.pendingByteCount, 0))
      };
      this.lastSnapshot = {
        enabled: true,
        available: true,
        sourceScanComplete: true,
        globalSyncState: globalSyncState(rows, effectiveHealth, { scanComplete: true }),
        rows,
        sourceCount: sources.length,
        pendingFileCount: effectiveHealth.pendingFileCount,
        pendingByteCount: effectiveHealth.pendingByteCount,
        health: effectiveHealth,
        error: null
      };
    } catch (error) {
      this.lastSnapshot = {
        ...this.lastSnapshot,
        sourceScanComplete: false,
        globalSyncState: ARCHIVE_SYNC_STATE.STALE,
        error: error?.message ?? String(error)
      };
    }
    return this.lastSnapshot;
  }

  close() {
    try { this.opened?.close?.(); } catch {}
    this.opened = null;
    this.healthStore = null;
  }
}
