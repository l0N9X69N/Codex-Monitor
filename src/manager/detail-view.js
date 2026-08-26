export const MANAGER_DETAIL_TABS = Object.freeze([
  'info',
  'timeline',
  'tokens',
  'turns',
  'tools',
  'resources',
  'errors'
]);

function nullableNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function durationMs(startedAtMs, lastEventAtMs) {
  const start = nullableNumber(startedAtMs);
  const end = nullableNumber(lastEventAtMs);
  if (start == null || end == null || end < start) return null;
  return end - start;
}

function sortedToolCounts(byName = {}) {
  return Object.entries(byName)
    .map(([name, count]) => ({ name, count: nullableNumber(count) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function normalizedValue(metric) {
  const value = metric?.value;
  return value === null || value === undefined || value === '' ? null : value;
}

function analyticsDetail(model) {
  const analytics = model.analytics;
  if (!analytics) return null;
  const input = nullableNumber(analytics.tokens?.input);
  const cached = nullableNumber(analytics.tokens?.cached);
  const output = nullableNumber(analytics.tokens?.output);
  const reasoning = nullableNumber(analytics.tokens?.reasoning);
  const uncachedInput = input != null && cached != null ? Math.max(0, input - cached) : null;
  const total = input != null && output != null ? input + output : null;
  return {
    context: {
      currentUsed: nullableNumber(analytics.context?.currentUsed),
      currentWindow: nullableNumber(analytics.context?.currentWindow),
      peakUsed: nullableNumber(analytics.context?.peakUsed),
      peakPercent: nullableNumber(analytics.context?.peakPercent),
      points: Array.isArray(analytics.context?.points) ? analytics.context.points : [],
      compactions: Array.isArray(analytics.context?.compactions) ? analytics.context.compactions : []
    },
    tokens: {
      input,
      cached,
      uncachedInput,
      output,
      reasoning,
      total,
      points: Array.isArray(analytics.tokens?.points) ? analytics.tokens.points : []
    },
    turns: {
      completed: nullableNumber(analytics.turns?.completed) ?? 0,
      dropped: nullableNumber(analytics.turns?.dropped) ?? 0,
      items: Array.isArray(analytics.turns?.items) ? analytics.turns.items : []
    },
    tools: {
      total: nullableNumber(analytics.tools?.total) ?? 0,
      byName: sortedToolCounts(analytics.tools?.byName),
      events: Array.isArray(analytics.tools?.events) ? analytics.tools.events : []
    },
    signals: Array.isArray(analytics.signals) ? analytics.signals : []
  };
}

export function createSelectedSessionDetail(meta, model) {
  if (!meta || !model) return null;
  const startedAtMs = model.info?.startedAtMs ?? meta.startedAtMs ?? null;
  const lastEventAtMs = model.info?.lastEventAtMs ?? meta.lastActivityAtMs ?? meta.modifiedAtMs ?? null;
  const toolCounts = sortedToolCounts(model.tools?.byName);
  const normalizedRequestedModel = normalizedValue(model.normalized?.model?.requested);
  const normalizedActualModel = normalizedValue(model.normalized?.model?.actual);
  const normalizedReasoning = normalizedValue(model.normalized?.model?.reasoning);

  return {
    id: meta.id,
    state: meta.state ?? null,
    tabs: [...MANAGER_DETAIL_TABS],
    info: {
      threadId: model.info?.threadId ?? meta.threadId ?? null,
      model: model.info?.model ?? normalizedActualModel ?? normalizedRequestedModel ?? meta.model ?? null,
      reasoning: model.info?.reasoning ?? normalizedReasoning ?? null,
      cwd: model.info?.cwd ?? meta.cwd ?? null,
      project: meta.project ?? null,
      startedAtMs,
      lastEventAtMs,
      durationMs: durationMs(startedAtMs, lastEventAtMs),
      filePath: meta.filePath ?? model.filePath ?? null,
      fileSizeBytes: nullableNumber(meta.sizeBytes),
      parsedLines: nullableNumber(model.parsedLines) ?? 0,
      rejectedLines: nullableNumber(model.rejectedLines) ?? 0
    },
    tokens: {
      input: nullableNumber(model.tokens?.input),
      cached: nullableNumber(model.tokens?.cached),
      output: nullableNumber(model.tokens?.output),
      reasoning: nullableNumber(model.tokens?.reasoning),
      contextWindow: nullableNumber(model.tokens?.contextWindow),
      contextUsed: nullableNumber(model.tokens?.contextUsed)
    },
    turns: {
      count: nullableNumber(model.turns?.count) ?? 0,
      completed: nullableNumber(model.turns?.completed) ?? 0,
      lastDurationMs: nullableNumber(model.turns?.lastDurationMs)
    },
    tools: {
      count: nullableNumber(model.tools?.count) ?? 0,
      byName: toolCounts,
      recent: Array.isArray(model.tools?.recent)
        ? model.tools.recent.map((item) => ({
          atMs: nullableNumber(item?.atMs),
          name: item?.name ?? null,
          callId: item?.callId ?? null
        }))
        : []
    },
    analytics: analyticsDetail(model),
    // HistoryEngine already sanitizes timeline entries. Keep the selected model's
    // array by reference so a long live session is not cloned every 250ms tick.
    timeline: Array.isArray(model.timeline) ? model.timeline : [],
    resources: {
      evidence: Array.isArray(model.resources?.evidence)
        ? model.resources.evidence.map((item) => ({
          kind: item?.kind ?? null,
          value: item?.value ?? null,
          atMs: nullableNumber(item?.atMs)
        }))
        : []
    },
    errors: Array.isArray(model.errors)
      ? model.errors.map((item) => ({
        atMs: nullableNumber(item?.atMs),
        detail: item?.detail ?? null
      }))
      : []
  };
}
