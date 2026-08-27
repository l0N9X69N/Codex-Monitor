export const ARCHIVE_SCHEMA_VERSION = 2;
export const ARCHIVE_PARSER_VERSION = 1;

export const ARCHIVE_SYNC_STATE = Object.freeze({
  READY: 'READY',
  CATCHING_UP: 'CATCHING_UP',
  UNINDEXED: 'UNINDEXED',
  STALE: 'STALE',
  ARCHIVED: 'ARCHIVED'
});

export const ARCHIVE_SESSION_STATE = Object.freeze({
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  ARCHIVED: 'ARCHIVED'
});

export const DEFAULT_ARCHIVE_CONFIG = Object.freeze({
  enabled: false,
  retention: 'forever',
  sizeLimitBytes: null,
  autoCleanup: false
});
