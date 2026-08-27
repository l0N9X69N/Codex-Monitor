import { ARCHIVE_PARSER_VERSION, ARCHIVE_SESSION_STATE, ARCHIVE_SYNC_STATE } from './constants.js';
import { normalizeArchiveLines } from './event-normalizer.js';
import { inspectArchiveSource, readCommittedJsonlChunk } from './source-reader.js';

function normalizedTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function staleReason(source, ingest, parserVersion) {
  if (!ingest) return null;
  if (ingest.parserVersion !== parserVersion) return 'parser-version-mismatch';
  if (ingest.fileIdentity && source.fileIdentity && ingest.fileIdentity !== source.fileIdentity) return 'source-identity-changed';
  if (ingest.committedOffset > source.size) return 'source-truncated';
  if (ingest.committedOffset === source.size
    && normalizedTimestamp(ingest.sourceMtime) !== normalizedTimestamp(source.mtimeMs)) {
    return 'source-modified-at-checkpoint';
  }
  return null;
}

function syncState(committedOffset, observedSize) {
  return committedOffset === observedSize ? ARCHIVE_SYNC_STATE.READY : ARCHIVE_SYNC_STATE.CATCHING_UP;
}

export async function reconcileArchiveSource({
  filePath,
  repository,
  maxBytes,
  parserVersion = ARCHIVE_PARSER_VERSION,
  sessionState = ARCHIVE_SESSION_STATE.ENDED,
  inspectSource = inspectArchiveSource,
  readChunk = readCommittedJsonlChunk,
  normalizeLines = normalizeArchiveLines
} = {}) {
  if (!filePath) throw new Error('archive reconcile requires a source path');
  if (!repository) throw new Error('archive reconcile requires a repository');

  const source = await inspectSource(filePath);
  if (!source.exists) {
    const missing = repository.markSourceMissing(filePath);
    return {
      state: missing.archived ? ARCHIVE_SYNC_STATE.ARCHIVED : ARCHIVE_SYNC_STATE.STALE,
      sourceExists: false,
      sessionId: missing.sessionId,
      committedOffset: repository.getIngestState(filePath)?.committedOffset ?? 0,
      observedFileSize: 0
    };
  }

  const existing = repository.getIngestState(filePath);
  const reason = staleReason(source, existing, parserVersion);
  if (reason) {
    return {
      state: ARCHIVE_SYNC_STATE.STALE,
      reason,
      sourceExists: true,
      sessionId: existing?.sessionId ?? null,
      committedOffset: existing?.committedOffset ?? 0,
      observedFileSize: source.size
    };
  }

  const committedOffset = existing?.committedOffset ?? 0;
  const chunk = await readChunk(filePath, { committedOffset, ...(maxBytes == null ? {} : { maxBytes }) });
  if (chunk.truncated) {
    return {
      state: ARCHIVE_SYNC_STATE.STALE,
      reason: 'source-truncated',
      sourceExists: true,
      sessionId: existing?.sessionId ?? null,
      committedOffset,
      observedFileSize: chunk.observedFileSize
    };
  }

  if (chunk.commitCandidateOffset === committedOffset) {
    const state = existing
      ? syncState(committedOffset, chunk.observedFileSize)
      : ARCHIVE_SYNC_STATE.UNINDEXED;
    return {
      state,
      reason: chunk.pendingPartialBytes > 0 ? 'partial-line' : null,
      sourceExists: true,
      sessionId: existing?.sessionId ?? null,
      committedOffset,
      observedFileSize: chunk.observedFileSize,
      bytesRead: chunk.bytesRead,
      eventCount: 0,
      parseErrorCount: 0
    };
  }

  const normalized = normalizeLines(chunk.lines, { sessionId: existing?.sessionId ?? null });
  if (!normalized.sessionId) {
    return {
      state: ARCHIVE_SYNC_STATE.UNINDEXED,
      reason: 'missing-session-identity',
      sourceExists: true,
      sessionId: null,
      committedOffset,
      observedFileSize: chunk.observedFileSize,
      bytesRead: chunk.bytesRead,
      eventCount: normalized.events.length,
      parseErrorCount: normalized.parseErrors.length
    };
  }

  const commit = repository.commitChunk({
    source: {
      filePath,
      fileIdentity: chunk.fileIdentity,
      size: chunk.observedFileSize,
      mtimeMs: chunk.observedMtimeMs
    },
    sessionId: normalized.sessionId,
    events: normalized.events,
    commitOffset: chunk.commitCandidateOffset,
    parserVersion,
    sessionState
  });

  return {
    state: syncState(commit.committedOffset, chunk.observedFileSize),
    sourceExists: true,
    sessionId: normalized.sessionId,
    committedOffset: commit.committedOffset,
    observedFileSize: chunk.observedFileSize,
    bytesRead: chunk.bytesRead,
    eventCount: normalized.events.length,
    parseErrorCount: normalized.parseErrors.length,
    advanced: commit.advanced
  };
}
