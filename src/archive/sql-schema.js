import { ARCHIVE_SCHEMA_VERSION } from './constants.js';

export const ARCHIVE_PRAGMAS = Object.freeze([
  'PRAGMA journal_mode=WAL;',
  'PRAGMA synchronous=NORMAL;',
  'PRAGMA foreign_keys=ON;',
  'PRAGMA busy_timeout=2500;'
]);

export const ARCHIVE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  source_path TEXT,
  project TEXT,
  cwd TEXT,
  model TEXT,
  reasoning TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  last_activity_at INTEGER,
  state TEXT NOT NULL,
  raw_source_exists INTEGER NOT NULL DEFAULT 1,
  raw_file_size INTEGER NOT NULL DEFAULT 0,
  raw_file_mtime INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL DEFAULT 0,
  tool_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  compaction_count INTEGER NOT NULL DEFAULT 0,
  context_current INTEGER,
  context_peak INTEGER,
  archive_created_at INTEGER NOT NULL,
  archive_updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_state_activity ON sessions(state, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_project_activity ON sessions(project, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

CREATE TABLE IF NOT EXISTS turns (
  session_id TEXT NOT NULL,
  turn_no INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  duration_ms INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  context_used INTEGER,
  tool_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, turn_no),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_turns_session_started ON turns(session_id, started_at);

CREATE TABLE IF NOT EXISTS context_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  turn_no INTEGER,
  used_tokens INTEGER,
  window_tokens INTEGER,
  percent REAL,
  event_type TEXT NOT NULL,
  source_offset INTEGER,
  source_event_id TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_context_session_time ON context_samples(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_context_session_turn ON context_samples(session_id, turn_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_context_offset ON context_samples(session_id, source_offset, event_type) WHERE source_offset IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_context_event_id ON context_samples(session_id, source_event_id, event_type) WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS token_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  turn_no INTEGER,
  input_tokens INTEGER,
  cached_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  source_offset INTEGER,
  source_event_id TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tokens_session_time ON token_samples(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_tokens_session_turn ON token_samples(session_id, turn_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tokens_offset ON token_samples(session_id, source_offset) WHERE source_offset IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tokens_event_id ON token_samples(session_id, source_event_id) WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tool_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_no INTEGER,
  timestamp INTEGER NOT NULL,
  tool_type TEXT,
  tool_name TEXT,
  sanitized_detail TEXT,
  status TEXT,
  duration_ms INTEGER,
  source_offset INTEGER,
  source_event_id TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tools_session_time ON tool_events(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_tools_session_turn ON tool_events(session_id, turn_no);
CREATE INDEX IF NOT EXISTS idx_tools_session_name ON tool_events(session_id, tool_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tools_offset ON tool_events(session_id, source_offset, tool_type) WHERE source_offset IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tools_event_id ON tool_events(session_id, source_event_id, tool_type) WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  turn_no INTEGER,
  value_a REAL,
  value_b REAL,
  sanitized_metadata TEXT,
  source_offset INTEGER,
  source_event_id TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_events_session_time ON session_events(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_session_type_time ON session_events(session_id, type, timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_offset ON session_events(session_id, source_offset, type) WHERE source_offset IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_event_id ON session_events(session_id, source_event_id, type) WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS resource_usage (
  session_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  name TEXT NOT NULL,
  first_used_at INTEGER,
  last_used_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, resource_type, name),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ingest_state (
  source_path TEXT PRIMARY KEY,
  session_id TEXT,
  file_identity TEXT,
  committed_offset INTEGER NOT NULL DEFAULT 0,
  observed_file_size INTEGER NOT NULL DEFAULT 0,
  source_mtime INTEGER,
  parser_version INTEGER NOT NULL,
  last_success_at INTEGER,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingest_session ON ingest_state(session_id);

CREATE TABLE IF NOT EXISTS archive_suppressions (
  source_path TEXT PRIMARY KEY,
  session_id TEXT,
  file_identity TEXT,
  suppressed_at INTEGER NOT NULL,
  reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_archive_suppressions_session ON archive_suppressions(session_id);

CREATE TRIGGER IF NOT EXISTS trg_archive_suppressed_session_insert
BEFORE INSERT ON sessions
WHEN NEW.source_path IS NOT NULL
  AND EXISTS (SELECT 1 FROM archive_suppressions WHERE source_path = NEW.source_path)
BEGIN
  SELECT RAISE(ABORT, 'archive source suppressed');
END;

CREATE TRIGGER IF NOT EXISTS trg_archive_suppressed_ingest_insert
BEFORE INSERT ON ingest_state
WHEN EXISTS (SELECT 1 FROM archive_suppressions WHERE source_path = NEW.source_path)
BEGIN
  SELECT RAISE(IGNORE);
END;

CREATE TABLE IF NOT EXISTS archive_meta (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  schema_version INTEGER NOT NULL,
  last_successful_reconcile INTEGER,
  last_seen_source_scan INTEGER,
  reconcile_generation INTEGER NOT NULL DEFAULT 0,
  pending_file_count INTEGER NOT NULL DEFAULT 0,
  pending_byte_count INTEGER NOT NULL DEFAULT 0,
  hook_last_seen_at INTEGER,
  watcher_last_seen_at INTEGER,
  service_instance_id TEXT,
  archive_created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  status TEXT NOT NULL
);
`;

export function archiveBootstrapSql(nowMs = Date.now()) {
  const now = Number.isFinite(Number(nowMs)) ? Math.trunc(Number(nowMs)) : Date.now();
  return `${ARCHIVE_SCHEMA_SQL}\nINSERT OR IGNORE INTO archive_meta (singleton_id, schema_version, archive_created_at) VALUES (1, ${ARCHIVE_SCHEMA_VERSION}, ${now});`;
}
