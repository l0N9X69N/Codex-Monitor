export const MANAGER_DETAIL_TABS = Object.freeze([
  'info',
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

export function createSelectedSessionDetail(meta, model) {
  if (!meta || !model) return null;
  const startedAtMs = model.info?.startedAtMs ?? meta.startedAtMs ?? null;
  const lastEventAtMs = model.info?.lastEventAtMs ?? meta.lastActivityAtMs ?? meta.modifiedAtMs ?? null;
  const toolCounts = sortedToolCounts(model.tools?.byName);

  return {
    id: meta.id,
    state: meta.state ?? null,
    tabs: [...MANAGER_DETAIL_TABS],
    info: {
      threadId: model.info?.threadId ?? meta.threadId ?? null,
      model: model.info?.model ?? meta.model ?? null,
      reasoning: model.info?.reasoning ?? null,
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
