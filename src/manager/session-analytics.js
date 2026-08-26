const DEFAULT_SERIES_LIMIT = 2048;
const DEFAULT_TURN_LIMIT = 2000;
const DEFAULT_TOOL_EVENT_LIMIT = 2000;
const DEFAULT_SIGNAL_LIMIT = 1000;

function finiteOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanName(value, fallback = 'tool') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function tokenDerived(input, cached, output, reasoning) {
  const safeInput = finiteOrNull(input);
  const safeCached = finiteOrNull(cached);
  const safeOutput = finiteOrNull(output);
  const safeReasoning = finiteOrNull(reasoning);
  const uncachedInput = safeInput != null && safeCached != null
    ? Math.max(0, safeInput - safeCached)
    : null;
  const total = safeInput != null && safeOutput != null ? safeInput + safeOutput : null;
  return { input: safeInput, cached: safeCached, uncachedInput, output: safeOutput, reasoning: safeReasoning, total };
}

function appendRing(list, value, limit) {
  list.push(value);
  while (list.length > limit) list.shift();
}

function compactSeries(list, limit) {
  if (list.length <= limit) return;
  const first = list[0];
  const last = list.at(-1);
  const middle = [];
  for (let index = 1; index < list.length - 1; index += 2) middle.push(list[index]);
  list.splice(0, list.length, first, ...middle.slice(-(limit - 2)), last);
}

function appendSeries(list, value, limit) {
  list.push(value);
  compactSeries(list, limit);
}

function tokenSnapshot(analytics) {
  return {
    input: finiteOrNull(analytics.tokens.input),
    cached: finiteOrNull(analytics.tokens.cached),
    output: finiteOrNull(analytics.tokens.output),
    reasoning: finiteOrNull(analytics.tokens.reasoning)
  };
}

function deltaOrNull(current, baseline) {
  const value = finiteOrNull(current);
  const start = finiteOrNull(baseline);
  if (value == null || start == null || value < start) return null;
  return value - start;
}

function currentTurn(analytics) {
  return analytics._activeTurn ?? null;
}

function usageTargetTurn(analytics) {
  return analytics._activeTurn ?? analytics._lastCompletedTurn ?? null;
}

function updateTurnUsage(analytics, event) {
  const turn = usageTargetTurn(analytics);
  if (!turn) return;
  const current = tokenSnapshot(analytics);
  const baseline = turn._tokenBaseline ?? {};
  const inputDelta = deltaOrNull(current.input, baseline.input);
  const cachedDelta = deltaOrNull(current.cached, baseline.cached);
  const outputDelta = deltaOrNull(current.output, baseline.output);
  const reasoningDelta = deltaOrNull(current.reasoning, baseline.reasoning);
  turn.inputTokens = inputDelta ?? finiteOrNull(event.turnInputTokens) ?? turn.inputTokens;
  turn.cachedTokens = cachedDelta ?? turn.cachedTokens;
  turn.outputTokens = outputDelta ?? finiteOrNull(event.turnOutputTokens) ?? turn.outputTokens;
  turn.reasoningTokens = reasoningDelta ?? turn.reasoningTokens;
  turn.uncachedInputTokens = turn.inputTokens != null && turn.cachedTokens != null
    ? Math.max(0, turn.inputTokens - turn.cachedTokens)
    : null;
  turn.totalTokens = turn.inputTokens != null && turn.outputTokens != null
    ? turn.inputTokens + turn.outputTokens
    : null;
  if (event.contextUsed != null) turn.contextUsed = finiteOrNull(event.contextUsed);
  if (event.contextWindow != null) turn.contextWindow = finiteOrNull(event.contextWindow);
}

function pushContextPoint(analytics, event) {
  const used = finiteOrNull(event.contextUsed);
  const window = finiteOrNull(event.contextWindow);
  if (used == null && window == null) return;
  if (used != null) analytics.context.currentUsed = used;
  if (window != null) analytics.context.currentWindow = window;
  const effectiveUsed = analytics.context.currentUsed;
  const effectiveWindow = analytics.context.currentWindow;
  const percent = effectiveUsed != null && effectiveWindow != null && effectiveWindow > 0
    ? (effectiveUsed / effectiveWindow) * 100
    : null;
  const previous = analytics.context.points.at(-1);
  const atMs = finiteOrNull(event.atMs);
  if (!previous || previous.used !== effectiveUsed || previous.window !== effectiveWindow || previous.atMs !== atMs) {
    appendSeries(analytics.context.points, { atMs, used: effectiveUsed, window: effectiveWindow, percent }, analytics.limits.series);
  }
  if (effectiveUsed != null) analytics.context.peakUsed = Math.max(analytics.context.peakUsed ?? 0, effectiveUsed);
  if (percent != null) analytics.context.peakPercent = Math.max(analytics.context.peakPercent ?? 0, percent);
}

function pushTokenPoint(analytics, event) {
  const snapshot = tokenDerived(analytics.tokens.input, analytics.tokens.cached, analytics.tokens.output, analytics.tokens.reasoning);
  if (Object.values(snapshot).every((value) => value == null)) return;
  const atMs = finiteOrNull(event.atMs);
  const previous = analytics.tokens.points.at(-1);
  const changed = !previous
    || previous.input !== snapshot.input
    || previous.cached !== snapshot.cached
    || previous.output !== snapshot.output
    || previous.reasoning !== snapshot.reasoning
    || previous.atMs !== atMs;
  if (changed) appendSeries(analytics.tokens.points, { atMs, ...snapshot }, analytics.limits.series);
}

function startTurn(analytics, event) {
  const prior = currentTurn(analytics);
  if (prior && prior.completedAtMs == null) prior.incomplete = true;
  const item = {
    index: analytics.turns.nextIndex,
    turnId: event.turnId ?? null,
    startedAtMs: finiteOrNull(event.atMs),
    completedAtMs: null,
    durationMs: null,
    inputTokens: null,
    cachedTokens: null,
    uncachedInputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    totalTokens: null,
    contextUsed: analytics.context.currentUsed,
    contextWindow: analytics.context.currentWindow,
    toolCount: 0,
    toolNames: {},
    completed: false,
    incomplete: false,
    error: null,
    _tokenBaseline: tokenSnapshot(analytics)
  };
  analytics.turns.nextIndex += 1;
  appendRing(analytics.turns.items, item, analytics.limits.turns);
  analytics._activeTurn = item;
  if (analytics.turns.items.length >= analytics.limits.turns && item.index >= analytics.limits.turns) {
    analytics.turns.dropped = Math.max(0, item.index + 1 - analytics.turns.items.length);
  }
}

function findTurnForComplete(analytics, event) {
  const active = currentTurn(analytics);
  if (active && (!event.turnId || !active.turnId || active.turnId === event.turnId)) return active;
  if (event.turnId) {
    for (let index = analytics.turns.items.length - 1; index >= 0; index -= 1) {
      const item = analytics.turns.items[index];
      if (item.turnId === event.turnId && item.completedAtMs == null) {
        analytics._activeTurn = item;
        return item;
      }
    }
  }
  return active;
}

function completeTurn(analytics, event) {
  let turn = findTurnForComplete(analytics, event);
  if (!turn) {
    startTurn(analytics, { ...event, atMs: null });
    turn = currentTurn(analytics);
  }
  const atMs = finiteOrNull(event.atMs);
  turn.completedAtMs = atMs;
  turn.durationMs = atMs != null && turn.startedAtMs != null && atMs >= turn.startedAtMs ? atMs - turn.startedAtMs : null;
  turn.completed = true;
  turn.incomplete = false;
  turn.error = event.error ?? null;
  if (analytics.context.currentUsed != null) turn.contextUsed = analytics.context.currentUsed;
  if (analytics.context.currentWindow != null) turn.contextWindow = analytics.context.currentWindow;
  analytics.turns.completed += 1;
  analytics._lastCompletedTurn = turn;
  analytics._activeTurn = null;
}

function toolStart(analytics, event) {
  const name = cleanName(event.tool);
  analytics.tools.total += 1;
  analytics.tools.byName[name] = (analytics.tools.byName[name] ?? 0) + 1;
  const turn = currentTurn(analytics);
  if (turn) {
    turn.toolCount += 1;
    turn.toolNames[name] = (turn.toolNames[name] ?? 0) + 1;
  }
  const entry = {
    atMs: finiteOrNull(event.atMs), endAtMs: null, durationMs: null, name,
    callId: event.callId ?? null, turnIndex: turn?.index ?? null,
    failed: false, status: null, exitCode: null
  };
  appendRing(analytics.tools.events, entry, analytics.limits.toolEvents);
  if (event.callId) analytics._activeTools.set(event.callId, entry);
}

function toolEnd(analytics, event) {
  const entry = event.callId ? analytics._activeTools.get(event.callId) : null;
  const atMs = finiteOrNull(event.atMs);
  const duration = finiteOrNull(event.durationMs)
    ?? (entry?.atMs != null && atMs != null && atMs >= entry.atMs ? atMs - entry.atMs : null);
  const exitCode = finiteOrNull(event.exitCode);
  const status = String(event.status ?? '').trim();
  const failed = (exitCode != null && exitCode !== 0) || /fail|error/i.test(status);
  if (entry) {
    entry.endAtMs = atMs;
    entry.durationMs = duration;
    entry.failed = failed;
    entry.status = status || null;
    entry.exitCode = exitCode;
  }
  if (failed) {
    appendRing(analytics.signals, {
      atMs, kind: 'tool-failure', detail: entry?.name ?? 'tool', tool: entry?.name ?? null, callId: event.callId ?? null
    }, analytics.limits.signals);
  }
  if (event.callId) analytics._activeTools.delete(event.callId);
}

function addSignal(analytics, event, kind, detail = null) {
  appendRing(analytics.signals, {
    atMs: finiteOrNull(event.atMs), kind, detail: detail ?? event.detail ?? event.error ?? null
  }, analytics.limits.signals);
}

export function createSessionAnalytics({
  seriesLimit = DEFAULT_SERIES_LIMIT,
  turnLimit = DEFAULT_TURN_LIMIT,
  toolEventLimit = DEFAULT_TOOL_EVENT_LIMIT,
  signalLimit = DEFAULT_SIGNAL_LIMIT
} = {}) {
  return {
    limits: {
      series: Math.max(64, Number(seriesLimit) || DEFAULT_SERIES_LIMIT),
      turns: Math.max(32, Number(turnLimit) || DEFAULT_TURN_LIMIT),
      toolEvents: Math.max(64, Number(toolEventLimit) || DEFAULT_TOOL_EVENT_LIMIT),
      signals: Math.max(32, Number(signalLimit) || DEFAULT_SIGNAL_LIMIT)
    },
    context: { points: [], compactions: [], currentUsed: null, currentWindow: null, peakUsed: null, peakPercent: null },
    tokens: { input: null, cached: null, output: null, reasoning: null, points: [] },
    turns: { items: [], nextIndex: 0, completed: 0, dropped: 0 },
    tools: { total: 0, byName: {}, events: [] },
    signals: [],
    _activeTurn: null,
    _lastCompletedTurn: null,
    _activeTools: new Map()
  };
}

export function applySessionAnalyticsEvent(analytics, event) {
  if (!analytics || !event) return analytics;
  if (event.kind === 'turn-start') { startTurn(analytics, event); return analytics; }
  if (event.kind === 'turn-complete') {
    completeTurn(analytics, event);
    if (event.error) addSignal(analytics, event, 'turn-error', event.error);
    return analytics;
  }
  if (event.kind === 'usage') {
    if (event.inputTokens != null) analytics.tokens.input = finiteOrNull(event.inputTokens);
    if (event.cachedInputTokens != null) analytics.tokens.cached = finiteOrNull(event.cachedInputTokens);
    if (event.outputTokens != null) analytics.tokens.output = finiteOrNull(event.outputTokens);
    if (event.reasoningTokens != null) analytics.tokens.reasoning = finiteOrNull(event.reasoningTokens);
    pushContextPoint(analytics, event);
    pushTokenPoint(analytics, event);
    updateTurnUsage(analytics, event);
    return analytics;
  }
  if (event.kind === 'tool-start') { toolStart(analytics, event); return analytics; }
  if (event.kind === 'tool-end') { toolEnd(analytics, event); return analytics; }
  if (event.kind === 'compaction') {
    appendRing(analytics.context.compactions, {
      atMs: finiteOrNull(event.atMs), used: analytics.context.currentUsed, window: analytics.context.currentWindow
    }, analytics.limits.signals);
    addSignal(analytics, event, 'compaction', 'Context compacted');
    return analytics;
  }
  if (event.kind === 'retry') { addSignal(analytics, event, 'retry'); return analytics; }
  if (event.kind === 'error') { addSignal(analytics, event, 'error'); return analytics; }
  return analytics;
}

export function sessionAnalyticsSummary(analytics) {
  if (!analytics) return null;
  const token = tokenDerived(analytics.tokens.input, analytics.tokens.cached, analytics.tokens.output, analytics.tokens.reasoning);
  return {
    context: {
      currentUsed: analytics.context.currentUsed,
      currentWindow: analytics.context.currentWindow,
      peakUsed: analytics.context.peakUsed,
      peakPercent: analytics.context.peakPercent,
      points: analytics.context.points,
      compactions: analytics.context.compactions
    },
    tokens: { ...token, points: analytics.tokens.points },
    turns: { completed: analytics.turns.completed, dropped: analytics.turns.dropped, items: analytics.turns.items },
    tools: { total: analytics.tools.total, byName: analytics.tools.byName, events: analytics.tools.events },
    signals: analytics.signals
  };
}

export { DEFAULT_SERIES_LIMIT, DEFAULT_TURN_LIMIT, DEFAULT_TOOL_EVENT_LIMIT, DEFAULT_SIGNAL_LIMIT };
