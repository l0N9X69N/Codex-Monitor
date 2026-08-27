const DETAIL_TABS = Object.freeze(['info', 'timeline', 'tokens', 'turns', 'tools', 'resources', 'errors']);

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function duration(start, end) {
  const a = finiteOrNull(start);
  const b = finiteOrNull(end);
  return a != null && b != null && b >= a ? b - a : null;
}

function toolByName(rows) {
  const counts = new Map();
  for (const row of rows) {
    const name = row.tool_name ?? row.tool_type ?? 'tool';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function toolByType(rows) {
  const counts = new Map();
  for (const row of rows) {
    const type = row.tool_type ?? 'tool';
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function signalKind(type) {
  if (type === 'archive_parse_error') return 'error';
  return type ?? 'event';
}

function tableExists(db, name) {
  try {
    return Boolean(db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  } catch {
    return false;
  }
}

function tokenDerived(row) {
  const input = finiteOrNull(row?.input_tokens);
  const cached = finiteOrNull(row?.cached_tokens);
  const output = finiteOrNull(row?.output_tokens);
  const reasoning = finiteOrNull(row?.reasoning_tokens);
  return {
    atMs: finiteOrNull(row?.timestamp),
    turnNo: finiteOrNull(row?.turn_no),
    input,
    cached,
    uncachedInput: input != null && cached != null ? Math.max(0, input - cached) : null,
    output,
    reasoning,
    total: input != null && output != null ? input + output : null
  };
}

function timelineEvents(turns, tools, events) {
  const output = [];
  for (const turn of turns) {
    if (finiteOrNull(turn.started_at) != null) {
      output.push({
        atMs: Number(turn.started_at),
        category: 'turn',
        group: 'turn',
        label: `Turn ${Number(turn.turn_no)}`,
        rawType: 'turn-start',
        turnId: String(turn.turn_no),
        detail: 'started'
      });
    }
    if (finiteOrNull(turn.ended_at) != null) {
      output.push({
        atMs: Number(turn.ended_at),
        category: 'turn',
        group: 'turn',
        label: `Turn ${Number(turn.turn_no)}`,
        rawType: 'turn-complete',
        turnId: String(turn.turn_no),
        detail: 'completed'
      });
    }
  }
  for (const tool of tools) {
    const failed = String(tool.status ?? '').toUpperCase() === 'FAILED';
    const group = tool.tool_type ?? 'tool';
    output.push({
      atMs: finiteOrNull(tool.timestamp),
      category: failed ? 'error' : group,
      group,
      label: tool.tool_name ?? group,
      rawType: group,
      tool: tool.tool_name ?? null,
      callId: tool.source_event_id ?? null,
      detail: tool.status ?? null,
      status: tool.status ?? null,
      failed,
      durationMs: finiteOrNull(tool.duration_ms)
    });
  }
  for (const event of events) {
    const type = signalKind(event.type);
    output.push({
      atMs: finiteOrNull(event.timestamp),
      category: ['error', 'retry'].includes(type) ? type : type === 'compaction' ? 'turn' : 'event',
      group: ['error', 'retry'].includes(type) ? type : 'event',
      label: String(type).replaceAll('_', ' '),
      rawType: type,
      detail: event.sanitized_metadata ?? null,
      failed: type === 'error'
    });
  }
  output.sort((a, b) => Number(a.atMs ?? 0) - Number(b.atMs ?? 0));
  return output;
}

export function canUseManagerArchiveDetail(row) {
  if (!row?.archiveBacked || !row?.threadId) return false;
  if (row.state === 'LIVE') return false;
  return row.archiveSyncState === 'READY' || row.archiveSyncState === 'ARCHIVED';
}

export function readManagerArchiveDetail(archiveIndex, row) {
  if (!canUseManagerArchiveDetail(row)) return null;
  const db = archiveIndex?.opened?.repository?.db;
  if (!db?.prepare) return null;
  const sessionId = String(row.threadId);
  const session = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
  if (!session) return null;

  const turns = db.prepare('SELECT * FROM turns WHERE session_id = ? ORDER BY turn_no ASC').all(sessionId);
  const contexts = db.prepare('SELECT * FROM context_samples WHERE session_id = ? ORDER BY timestamp ASC, id ASC').all(sessionId);
  const tokenRows = tableExists(db, 'token_samples')
    ? db.prepare('SELECT * FROM token_samples WHERE session_id = ? ORDER BY timestamp ASC, id ASC').all(sessionId)
    : [];
  const tools = db.prepare('SELECT * FROM tool_events WHERE session_id = ? ORDER BY timestamp ASC, id ASC').all(sessionId);
  const events = db.prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY timestamp ASC, id ASC').all(sessionId);
  const resources = db.prepare('SELECT * FROM resource_usage WHERE session_id = ? ORDER BY resource_type ASC, use_count DESC, name ASC').all(sessionId);
  const schemaVersion = integer(db.prepare('SELECT schema_version FROM archive_meta WHERE singleton_id = 1').get()?.schema_version, 1);

  const contextPoints = contexts.map((item) => ({
    atMs: finiteOrNull(item.timestamp),
    used: finiteOrNull(item.used_tokens),
    window: finiteOrNull(item.window_tokens),
    percent: finiteOrNull(item.percent),
    eventType: item.event_type ?? null
  }));
  const tokenPoints = tokenRows.map(tokenDerived);
  const tokenTurns = new Set(tokenRows.map((item) => finiteOrNull(item.turn_no)).filter((value) => value != null));
  const compactions = events
    .filter((item) => item.type === 'compaction')
    .map((item) => ({ atMs: finiteOrNull(item.timestamp), kind: 'compaction' }));
  const turnItems = turns.map((item, index) => {
    const turnNo = integer(item.turn_no, index + 1);
    const hasTokenCoverage = tokenTurns.has(turnNo);
    const input = finiteOrNull(item.input_tokens);
    const cached = hasTokenCoverage ? finiteOrNull(item.cached_tokens) : null;
    const output = finiteOrNull(item.output_tokens);
    const reasoning = hasTokenCoverage ? finiteOrNull(item.reasoning_tokens) : null;
    const completed = finiteOrNull(item.ended_at) != null;
    const contextUsed = finiteOrNull(item.context_used);
    return {
      index,
      turnNo,
      startedAtMs: finiteOrNull(item.started_at),
      completedAtMs: finiteOrNull(item.ended_at),
      durationMs: finiteOrNull(item.duration_ms) ?? duration(item.started_at, item.ended_at),
      inputTokens: input,
      cachedTokens: cached,
      uncachedInputTokens: input != null && cached != null ? Math.max(0, input - cached) : null,
      outputTokens: output,
      reasoningTokens: reasoning,
      totalTokens: input != null && output != null ? input + output : null,
      contextUsed,
      contextWindow: null,
      toolCount: integer(item.tool_count, 0),
      completed,
      incomplete: !completed,
      tokenCoverage: hasTokenCoverage ? 'indexed' : 'legacy'
    };
  });
  const toolEvents = tools.map((item) => ({
    atMs: finiteOrNull(item.timestamp),
    name: item.tool_name ?? item.tool_type ?? null,
    group: item.tool_type ?? 'tool',
    callId: item.source_event_id ?? null,
    durationMs: finiteOrNull(item.duration_ms),
    failed: String(item.status ?? '').toUpperCase() === 'FAILED',
    status: item.status ?? null
  }));
  const signals = events.map((item) => ({
    atMs: finiteOrNull(item.timestamp),
    kind: signalKind(item.type),
    detail: item.sanitized_metadata ?? null
  }));
  const errors = signals
    .filter((item) => item.kind === 'error' || item.kind === 'archive_parse_error')
    .map((item) => ({ atMs: item.atMs, detail: item.detail ?? item.kind }));
  const input = finiteOrNull(session.input_tokens);
  const cached = finiteOrNull(session.cached_tokens);
  const output = finiteOrNull(session.output_tokens);
  const reasoning = finiteOrNull(session.reasoning_tokens);
  const currentContext = finiteOrNull(session.context_current);
  const peakContext = finiteOrNull(session.context_peak);
  const peakPercent = contextPoints.reduce((max, point) => Math.max(max, finiteOrNull(point.percent) ?? 0), 0) || null;
  const lastTurn = turnItems.at(-1) ?? null;

  return {
    id: row.id,
    state: row.state ?? session.state ?? null,
    tabs: [...DETAIL_TABS],
    source: 'archive-sqlite',
    archiveSyncState: row.archiveSyncState ?? null,
    archiveSchemaVersion: schemaVersion,
    info: {
      threadId: sessionId,
      model: session.model ?? row.model ?? null,
      reasoning: session.reasoning ?? row.reasoning ?? null,
      cwd: session.cwd ?? row.cwd ?? null,
      project: session.project ?? row.project ?? null,
      startedAtMs: finiteOrNull(session.started_at),
      lastEventAtMs: finiteOrNull(session.last_activity_at),
      durationMs: duration(session.started_at, session.last_activity_at),
      filePath: row.filePath ?? session.source_path ?? null,
      fileSizeBytes: row.fileSizeBytes ?? finiteOrNull(session.raw_file_size),
      parsedLines: null,
      rejectedLines: null
    },
    tokens: {
      input,
      cached,
      output,
      reasoning,
      contextWindow: contextPoints.at(-1)?.window ?? null,
      contextUsed: currentContext
    },
    turns: {
      count: integer(session.turn_count, turnItems.length),
      completed: turnItems.filter((item) => item.completed).length,
      lastDurationMs: lastTurn?.durationMs ?? null
    },
    tools: {
      count: integer(session.tool_count, tools.length),
      byName: toolByName(tools),
      byType: toolByType(tools),
      recent: toolEvents.slice(-12)
    },
    analytics: {
      context: {
        currentUsed: currentContext,
        currentWindow: contextPoints.at(-1)?.window ?? null,
        peakUsed: peakContext,
        peakPercent,
        points: contextPoints,
        compactions
      },
      tokens: {
        input,
        cached,
        uncachedInput: input != null && cached != null ? Math.max(0, input - cached) : null,
        output,
        reasoning,
        total: input != null && output != null ? input + output : null,
        points: tokenPoints,
        coverage: tokenPoints.length > 0 ? 'indexed' : (schemaVersion >= 2 ? 'empty' : 'legacy')
      },
      turns: {
        completed: turnItems.filter((item) => item.completed).length,
        dropped: 0,
        items: turnItems
      },
      tools: {
        total: tools.length,
        byName: toolByName(tools),
        byType: toolByType(tools),
        events: toolEvents
      },
      signals
    },
    timeline: timelineEvents(turns, tools, events),
    resources: {
      evidence: resources.map((item) => ({
        kind: item.resource_type ?? 'resource',
        value: item.name ?? null,
        atMs: finiteOrNull(item.last_used_at),
        count: integer(item.use_count, 0)
      }))
    },
    errors
  };
}
