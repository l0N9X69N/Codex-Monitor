import { ARCHIVE_PARSER_VERSION, ARCHIVE_SYNC_STATE } from './constants.js';

function integer(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function classifyArchiveSyncState({
  source = null,
  ingest = null,
  hasArchiveData = false,
  parserVersion = ARCHIVE_PARSER_VERSION,
  scanComplete = true,
  pendingFileCount = 0,
  pendingByteCount = 0
} = {}) {
  if (!source) return hasArchiveData ? ARCHIVE_SYNC_STATE.ARCHIVED : ARCHIVE_SYNC_STATE.STALE;
  if (!ingest) return ARCHIVE_SYNC_STATE.UNINDEXED;

  const committedOffset = integer(ingest.committedOffset);
  const observedSize = integer(source.size);
  const pendingFiles = integer(pendingFileCount);
  const pendingBytes = integer(pendingByteCount);

  if (ingest.lastError) return ARCHIVE_SYNC_STATE.STALE;
  if (ingest.parserVersion !== parserVersion) return ARCHIVE_SYNC_STATE.STALE;
  if (ingest.fileIdentity && source.fileIdentity && ingest.fileIdentity !== source.fileIdentity) {
    return ARCHIVE_SYNC_STATE.STALE;
  }
  if (committedOffset > observedSize) return ARCHIVE_SYNC_STATE.STALE;
  if (committedOffset < observedSize) return ARCHIVE_SYNC_STATE.CATCHING_UP;
  if (!scanComplete || pendingFiles > 0 || pendingBytes > 0) return ARCHIVE_SYNC_STATE.CATCHING_UP;

  return ARCHIVE_SYNC_STATE.READY;
}
