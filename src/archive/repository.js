import path from 'node:path';
import { ARCHIVE_PARSER_VERSION, ARCHIVE_SCHEMA_VERSION, ARCHIVE_SESSION_STATE } from './constants.js';
import { ARCHIVE_PRAGMAS, archiveBootstrapSql } from './sql-schema.js';

function integer(value, fallback = null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function timestamp(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(Number(value)) : fallback;
}

function changes(result) {
  return Number(result?.changes ?? 0);
}

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

function sessionRow(row) {
  if (!row) return null;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  return result;
}

function validState(value) {
  return Object.values(ARCHIVE_SESSION_STATE).includes(value) ? value : ARCHIVE_SESSION_STATE.ENDED;
}

function maxEventTime(events, fallback) {
  let latest = fallback;
  for (const event of events) {
    const atMs = timestamp(event?.atMs, null);
    if (atMs != null && (latest == null || atMs > latest)) latest = atMs;
  }
  return latest;
}

function nonNegativeDelta(next, previous) {
  const current = integer(next, null);
  const prior = integer(previous, null);
  if (current == null || prior == null || current < prior) return null;
  return current - prior;
}

function toolGroup(event) {
  const rawType = String(event?.rawType ?? '').toLowerCase();
  const name = String(event?.tool ?? '').toLowerCase();
  const leaf = name.split(/[.:/\\]/).filter(Boolean).at(-1) ?? name;
  if (leaf === 'spawn_agent') return 'agent';
  if (rawType.includes('patch_apply') || /(^|[_:/])(read|write|edit)_file($|[_:/])/.test(name) || name.includes('apply_patch')) return 'file';
  if (rawType.includes('exec_command') || rawType.includes('local_shell') || name.includes('shell') || name.includes('exec_command')) return 'shell';
  if (rawType.includes('web_search') || name.includes('web_search')) return 'web';
  if (rawType.includes('image_generation') || name.includes('image_generation')) return 'image';
  if (rawType.includes('mcp_tool_call')) return 'mcp';
  return 'tool';
}

export class ArchiveRepository {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') {
      throw new TypeError('ArchiveRepository requires a SQLite-like database with exec() and prepare()');
    }
    this.db = db;
    this.now = now;
  }

  initialize() {
    for (const pragma of ARCHIVE_PRAGMAS) this.db.exec(pragma);
    const nowMs = timestamp(this.now(), Date.now());
    this.db.exec(archiveBootstrapSql(nowMs));
    this.db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at, status) VALUES (?, ?, ?)')
      .run(ARCHIVE_SCHEMA_VERSION, nowMs, 'applied');
    this.db.prepare('UPDATE archive_meta SET schema_version = ? WHERE singleton_id = 1').run(ARCHIVE_SCHEMA_VERSION);
    return this;
  }

  getIngestState(sourcePath) {
    return ingestRow(this.db.prepare('SELECT * FROM ingest_state WHERE source_path = ?').get(sourcePath));
  }

  getSession(sessionId) {
    return sessionRow(this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId));
  }

  count(table) {
    const allowed = new Set(['sessions', 'turns', 'context_samples', 'token_samples', 'tool_events', 'session_events', 'resource_usage', 'ingest_state']);
    if (!allowed.has(table)) throw new Error(`unsupported archive table: ${table}`);
    return Number(this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0);
  }

  commitChunk({
    source,
    sessionId,
    events = [],
    commitOffset,
    parserVersion = ARCHIVE_PARSER_VERSION,
    sessionState = ARCHIVE_SESSION_STATE.ENDED
  } = {}) {
    const sourcePath = source?.filePath;
    const fileIdentity = source?.fileIdentity ?? null;
    const observedSize = integer(source?.size, null);
    const sourceMtime = timestamp(source?.mtimeMs, null);
    const nextOffset = integer(commitOffset, null);
    if (!sourcePath) throw new Error('archive source path is required');
    if (!sessionId) throw new Error('archive session identity is required before committing derived state');
    if (observedSize == null || nextOffset == null || nextOffset > observedSize) throw new Error('invalid archive source or commit offset');

    return transaction(this.db, () => {
      const existing = this.getIngestState(sourcePath);
      if (existing) {
        if (existing.fileIdentity && fileIdentity && existing.fileIdentity !== fileIdentity) {
          throw new Error('archive source identity changed; rebuild required');
        }
        if (existing.parserVersion !== parserVersion) throw new Error('archive parser version changed; rebuild required');
        if (existing.sessionId && existing.sessionId !== sessionId) throw new Error('archive session identity changed; rebuild required');
        if (nextOffset <= existing.committedOffset) {
          return { committedOffset: existing.committedOffset, advanced: false, eventCount: 0 };
        }
      }

      const nowMs = timestamp(this.now(), Date.now());
      const state = validState(sessionState);
      const firstMeta = events.find((event) => event?.kind === 'session-meta') ?? null;
      const cwd = firstMeta?.cwd ?? null;
      const project = cwd ? path.basename(path.resolve(cwd)) : null;
      const lastActivityAt = maxEventTime(events, sourceMtime ?? nowMs);

      this.db.prepare(`
        INSERT INTO sessions (
          session_id, source_path, project, cwd, model, reasoning, started_at, last_activity_at, state,
          raw_source_exists, raw_file_size, raw_file_mtime, archive_created_at, archive_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          source_path = excluded.source_path,
          project = COALESCE(excluded.project, sessions.project),
          cwd = COALESCE(excluded.cwd, sessions.cwd),
          model = COALESCE(excluded.model, sessions.model),
          reasoning = COALESCE(excluded.reasoning, sessions.reasoning),
          started_at = CASE
            WHEN sessions.started_at IS NULL THEN excluded.started_at
            WHEN excluded.started_at IS NULL THEN sessions.started_at
            ELSE MIN(sessions.started_at, excluded.started_at)
          END,
          last_activity_at = CASE
            WHEN sessions.last_activity_at IS NULL THEN excluded.last_activity_at
            WHEN excluded.last_activity_at IS NULL THEN sessions.last_activity_at
            ELSE MAX(sessions.last_activity_at, excluded.last_activity_at)
          END,
          state = excluded.state,
          raw_source_exists = 1,
          raw_file_size = excluded.raw_file_size,
          raw_file_mtime = excluded.raw_file_mtime,
          archive_updated_at = excluded.archive_updated_at
      `).run(
        sessionId,
        sourcePath,
        project,
        cwd,
        firstMeta?.model ?? null,
        firstMeta?.reasoning ?? null,
        timestamp(firstMeta?.atMs, null),
        lastActivityAt,
        state,
        observedSize,
        sourceMtime,
        nowMs,
        nowMs
      );

      const latestTurn = this.db.prepare('SELECT turn_no, started_at, ended_at FROM turns WHERE session_id = ? ORDER BY turn_no DESC LIMIT 1').get(sessionId);
      const openTurn = this.db.prepare('SELECT turn_no, started_at FROM turns WHERE session_id = ? AND ended_at IS NULL ORDER BY turn_no DESC LIMIT 1').get(sessionId);
      let maxTurnNo = integer(latestTurn?.turn_no, 0);
      let activeTurnNo = integer(openTurn?.turn_no, integer(latestTurn?.turn_no, null));

      const updateIdentity = this.db.prepare(`
        UPDATE sessions SET
          project = COALESCE(?, project),
          cwd = COALESCE(?, cwd),
          model = COALESCE(?, model),
          reasoning = COALESCE(?, reasoning),
          started_at = CASE WHEN started_at IS NULL THEN ? ELSE started_at END,
          archive_updated_at = ?
        WHERE session_id = ?
      `);
      const insertTurn = this.db.prepare('INSERT INTO turns (session_id, turn_no, started_at) VALUES (?, ?, ?)');
      const completeTurn = this.db.prepare('UPDATE turns SET ended_at = ?, duration_ms = CASE WHEN started_at IS NULL OR ? IS NULL THEN duration_ms ELSE MAX(0, ? - started_at) END WHERE session_id = ? AND turn_no = ?');
      const updateSessionUsage = this.db.prepare(`
        UPDATE sessions SET
          input_tokens = COALESCE(?, input_tokens),
          cached_tokens = COALESCE(?, cached_tokens),
          output_tokens = COALESCE(?, output_tokens),
          reasoning_tokens = COALESCE(?, reasoning_tokens),
          context_current = COALESCE(?, context_current),
          context_peak = CASE
            WHEN ? IS NULL THEN context_peak
            WHEN context_peak IS NULL OR ? > context_peak THEN ?
            ELSE context_peak
          END,
          archive_updated_at = ?
        WHERE session_id = ?
      `);
      const updateTurnUsage = this.db.prepare(`
        UPDATE turns SET
          input_tokens = COALESCE(?, input_tokens),
          cached_tokens = cached_tokens + ?,
          output_tokens = COALESCE(?, output_tokens),
          reasoning_tokens = reasoning_tokens + ?,
          context_used = COALESCE(?, context_used)
        WHERE session_id = ? AND turn_no = ?
      `);
      const insertContext = this.db.prepare(`
        INSERT OR IGNORE INTO context_samples
          (session_id, timestamp, turn_no, used_tokens, window_tokens, percent, event_type, source_offset)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertTokenSample = this.db.prepare(`
        INSERT OR IGNORE INTO token_samples
          (session_id, timestamp, turn_no, input_tokens, cached_tokens, output_tokens, reasoning_tokens, source_offset, source_event_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `);
      const insertTool = this.db.prepare(`
        INSERT OR IGNORE INTO tool_events
          (session_id, turn_no, timestamp, tool_type, tool_name, sanitized_detail, status, duration_ms, source_offset, source_event_id)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `);
      const updateToolByCall = this.db.prepare(`
        UPDATE tool_events SET status = COALESCE(?, status), duration_ms = COALESCE(?, duration_ms)
        WHERE session_id = ? AND source_event_id = ?
      `);
      const insertSessionEvent = this.db.prepare(`
        INSERT OR IGNORE INTO session_events
          (session_id, timestamp, type, turn_no, sanitized_metadata, source_offset, source_event_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const bumpSessionCounter = this.db.prepare('UPDATE sessions SET error_count = error_count + ?, retry_count = retry_count + ?, compaction_count = compaction_count + ?, archive_updated_at = ? WHERE session_id = ?');
      const bumpToolCount = this.db.prepare('UPDATE sessions SET tool_count = tool_count + ?, archive_updated_at = ? WHERE session_id = ?');
      const bumpTurnToolCount = this.db.prepare('UPDATE turns SET tool_count = tool_count + ? WHERE session_id = ? AND turn_no = ?');
      const bumpTurnCount = this.db.prepare('UPDATE sessions SET turn_count = turn_count + ?, archive_updated_at = ? WHERE session_id = ?');
      const updateModel = this.db.prepare('UPDATE sessions SET model = COALESCE(?, model), reasoning = COALESCE(?, reasoning), archive_updated_at = ? WHERE session_id = ?');
      const readSessionUsage = this.db.prepare('SELECT input_tokens, cached_tokens, output_tokens, reasoning_tokens FROM sessions WHERE session_id = ?');

      for (const event of events) {
        const atMs = timestamp(event?.atMs, nowMs);
        const sourceOffset = integer(event?.sourceOffset, null);

        if (event?.kind === 'session-meta') {
          const eventCwd = event.cwd ?? null;
          updateIdentity.run(
            eventCwd ? path.basename(path.resolve(eventCwd)) : null,
            eventCwd,
            event.model ?? null,
            event.reasoning ?? null,
            timestamp(event.atMs, null),
            nowMs,
            sessionId
          );
          continue;
        }

        if (event?.kind === 'model-settings') {
          updateModel.run(event.model ?? null, event.reasoning ?? null, nowMs, sessionId);
          continue;
        }

        if (event?.kind === 'actual-model') {
          updateModel.run(event.model ?? null, null, nowMs, sessionId);
          continue;
        }

        if (event?.kind === 'turn-start') {
          maxTurnNo += 1;
          insertTurn.run(sessionId, maxTurnNo, atMs);
          activeTurnNo = maxTurnNo;
          bumpTurnCount.run(1, nowMs, sessionId);
          continue;
        }

        if (event?.kind === 'turn-complete') {
          if (activeTurnNo != null) completeTurn.run(atMs, atMs, atMs, sessionId, activeTurnNo);
          if (event.error) {
            const inserted = changes(insertSessionEvent.run(sessionId, atMs, 'error', activeTurnNo, event.error, sourceOffset, event.turnId ?? null));
            if (inserted) bumpSessionCounter.run(1, 0, 0, nowMs, sessionId);
          }
          continue;
        }

        if (event?.kind === 'usage') {
          const priorUsage = readSessionUsage.get(sessionId) ?? {};
          const contextUsed = integer(event.contextUsed, null);
          const contextWindow = integer(event.contextWindow, null);
          const inputTokens = integer(event.inputTokens, null);
          const cachedTokens = integer(event.cachedInputTokens, null);
          const outputTokens = integer(event.outputTokens, null);
          const reasoningTokens = integer(event.reasoningTokens, null);
          const cachedDelta = nonNegativeDelta(cachedTokens, priorUsage.cached_tokens) ?? 0;
          const reasoningDelta = nonNegativeDelta(reasoningTokens, priorUsage.reasoning_tokens) ?? 0;

          updateSessionUsage.run(
            inputTokens,
            cachedTokens,
            outputTokens,
            reasoningTokens,
            contextUsed,
            contextUsed,
            contextUsed,
            contextUsed,
            nowMs,
            sessionId
          );
          if (activeTurnNo != null) {
            updateTurnUsage.run(
              integer(event.turnInputTokens, null),
              cachedDelta,
              integer(event.turnOutputTokens, null),
              reasoningDelta,
              contextUsed,
              sessionId,
              activeTurnNo
            );
          }
          insertTokenSample.run(
            sessionId,
            atMs,
            activeTurnNo,
            inputTokens,
            cachedTokens,
            outputTokens,
            reasoningTokens,
            sourceOffset
          );
          if (contextUsed != null || contextWindow != null) {
            const percent = contextUsed != null && contextWindow > 0 ? (contextUsed / contextWindow) * 100 : null;
            insertContext.run(sessionId, atMs, activeTurnNo, contextUsed, contextWindow, percent, event.rawType ?? 'usage', sourceOffset);
          }
          continue;
        }

        if (event?.kind === 'tool-start') {
          const inserted = changes(insertTool.run(
            sessionId,
            activeTurnNo,
            atMs,
            toolGroup(event),
            event.tool ?? null,
            'RUNNING',
            null,
            sourceOffset,
            event.callId ?? null
          ));
          if (inserted) {
            bumpToolCount.run(1, nowMs, sessionId);
            if (activeTurnNo != null) bumpTurnToolCount.run(1, sessionId, activeTurnNo);
          }
          continue;
        }

        if (event?.kind === 'tool-end') {
          const status = event.status ?? (event.exitCode == null || Number(event.exitCode) === 0 ? 'COMPLETED' : 'FAILED');
          const durationMs = integer(event.durationMs, null);
          let updated = 0;
          if (event.callId) updated = changes(updateToolByCall.run(status, durationMs, sessionId, event.callId));
          if (!updated) {
            const inserted = changes(insertTool.run(
              sessionId,
              activeTurnNo,
              atMs,
              'tool',
              null,
              status,
              durationMs,
              sourceOffset,
              event.callId ?? null
            ));
            if (inserted) {
              bumpToolCount.run(1, nowMs, sessionId);
              if (activeTurnNo != null) bumpTurnToolCount.run(1, sessionId, activeTurnNo);
            }
          }
          continue;
        }

        const eventType = event?.kind === 'archive-parse-error'
          ? 'archive_parse_error'
          : event?.kind === 'approval'
            ? 'approval'
            : event?.kind;
        if (['archive_parse_error', 'approval', 'error', 'retry', 'compaction'].includes(eventType)) {
          const inserted = changes(insertSessionEvent.run(
            sessionId,
            atMs,
            eventType,
            activeTurnNo,
            event.detail ?? null,
            sourceOffset,
            event.callId ?? event.turnId ?? null
          ));
          if (inserted) {
            bumpSessionCounter.run(eventType === 'error' ? 1 : 0, eventType === 'retry' ? 1 : 0, eventType === 'compaction' ? 1 : 0, nowMs, sessionId);
          }
        }
      }

      this.db.prepare(`
        UPDATE sessions SET
          last_activity_at = CASE
            WHEN last_activity_at IS NULL THEN ?
            WHEN ? IS NULL THEN last_activity_at
            ELSE MAX(last_activity_at, ?)
          END,
          raw_file_size = ?, raw_file_mtime = ?, raw_source_exists = 1, source_path = ?, archive_updated_at = ?
        WHERE session_id = ?
      `).run(lastActivityAt, lastActivityAt, lastActivityAt, observedSize, sourceMtime, sourcePath, nowMs, sessionId);

      this.db.prepare(`
        INSERT INTO ingest_state
          (source_path, session_id, file_identity, committed_offset, observed_file_size, source_mtime, parser_version, last_success_at, last_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(source_path) DO UPDATE SET
          session_id = excluded.session_id,
          file_identity = excluded.file_identity,
          committed_offset = excluded.committed_offset,
          observed_file_size = excluded.observed_file_size,
          source_mtime = excluded.source_mtime,
          parser_version = excluded.parser_version,
          last_success_at = excluded.last_success_at,
          last_error = NULL
      `).run(sourcePath, sessionId, fileIdentity, nextOffset, observedSize, sourceMtime, parserVersion, nowMs);

      this.db.prepare('UPDATE archive_meta SET last_successful_reconcile = ? WHERE singleton_id = 1').run(nowMs);
      return { committedOffset: nextOffset, advanced: true, eventCount: events.length };
    });
  }

  markSourceMissing(sourcePath) {
    return transaction(this.db, () => {
      const ingest = this.getIngestState(sourcePath);
      if (!ingest?.sessionId) return { archived: false, sessionId: null };
      const nowMs = timestamp(this.now(), Date.now());
      this.db.prepare(`
        UPDATE sessions SET source_path = NULL, raw_source_exists = 0, state = ?, archive_updated_at = ?
        WHERE session_id = ?
      `).run(ARCHIVE_SESSION_STATE.ARCHIVED, nowMs, ingest.sessionId);
      return { archived: true, sessionId: ingest.sessionId };
    });
  }
}
