const STATE_ORDER = Object.freeze({ LIVE: 0, UNKNOWN: 1, ENDED: 2 });

function numberOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lower(value) {
  return String(value ?? '').toLowerCase();
}

function scopeValue(value) {
  const scope = lower(value);
  return scope === 'live' || scope === 'ended' ? scope : 'all';
}

export function rowContextPercent(row) {
  const used = numberOrNull(row?.tokens?.contextUsed);
  const window = numberOrNull(row?.tokens?.contextWindow);
  if (used == null || window == null || window <= 0) return null;
  return Math.max(0, Math.min(100, (used / window) * 100));
}

export function rowTokenActivity(row) {
  const input = numberOrNull(row?.tokens?.input);
  const output = numberOrNull(row?.tokens?.output);
  const reasoning = numberOrNull(row?.tokens?.reasoning);
  const known = [input, output, reasoning].filter((value) => value != null);
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + value, 0);
}

export function rowToolActivity(row) {
  const exact = numberOrNull(row?.toolCount);
  if (exact != null) return exact;
  return numberOrNull(row?.observedToolCount);
}

function searchable(row) {
  return [row?.state, row?.project, row?.cwd, row?.threadId, row?.model, row?.name]
    .map(lower)
    .join('\n');
}

function sortMetric(row, sortBy) {
  switch (sortBy) {
    case 'state': return STATE_ORDER[row?.state] ?? 9;
    case 'project': return lower(row?.project ?? row?.name);
    case 'model': return lower(row?.model);
    case 'duration':
    case 'elapsed': return numberOrNull(row?.elapsedMs);
    case 'context': return rowContextPercent(row);
    case 'input': return numberOrNull(row?.tokens?.input);
    case 'cache': return numberOrNull(row?.tokens?.cached);
    case 'turn':
    case 'turns': return numberOrNull(row?.turnCount) ?? numberOrNull(row?.observedTurnCount);
    case 'tools': return rowToolActivity(row);
    case 'size': return numberOrNull(row?.fileSizeBytes);
    case 'lastActivity':
    default: return numberOrNull(row?.lastActivityAtMs) ?? numberOrNull(row?.modifiedAtMs);
  }
}

function compareMetric(a, b, direction) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === 'string' || typeof b === 'string'
    ? String(a).localeCompare(String(b))
    : Number(a) - Number(b);
  return direction === 'asc' ? result : -result;
}

function eventCount(rows, key) {
  return rows.reduce((sum, row) => sum + (Array.isArray(row?.[key]) ? row[key].length : 0), 0);
}

function storageBytes(rows) {
  return rows.reduce((sum, row) => sum + (numberOrNull(row?.fileSizeBytes) ?? 0), 0);
}

function shortSession(row) {
  const value = row?.threadId ?? row?.name ?? '';
  const text = String(value);
  if (!text) return '';
  return text.length <= 8 ? text : text.slice(-8);
}

function chartLabel(row) {
  const project = row?.project ?? row?.name ?? 'session';
  const suffix = shortSession(row);
  return suffix && suffix !== project ? `${project} · ${suffix}` : project;
}

function rankedChart(rows, metric, { limit = 6 } = {}) {
  return rows
    .map((row) => ({ id: row.id, label: chartLabel(row), state: row.state, value: metric(row), row }))
    .filter((item) => item.value != null)
    .sort((a, b) => b.value - a.value || String(a.id).localeCompare(String(b.id)))
    .slice(0, limit);
}

export function buildSessionDashboardModel(rows = [], {
  scope = 'all',
  search = '',
  sortBy = 'lastActivity',
  direction = 'desc',
  selectedId = null,
  selectedIndex = 0,
  chartLimit = 6
} = {}) {
  const source = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const normalizedScope = scopeValue(scope);
  const query = String(search ?? '').trim().toLowerCase();
  const normalizedDirection = lower(direction) === 'asc' ? 'asc' : 'desc';
  const normalizedSort = String(sortBy ?? 'lastActivity');

  const filtered = source.filter((row) => {
    if (normalizedScope === 'live' && row.state !== 'LIVE') return false;
    if (normalizedScope === 'ended' && row.state !== 'ENDED') return false;
    return !query || searchable(row).includes(query);
  });

  filtered.sort((a, b) => {
    const primary = compareMetric(sortMetric(a, normalizedSort), sortMetric(b, normalizedSort), normalizedDirection);
    if (primary) return primary;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });

  let resolvedIndex = selectedId ? filtered.findIndex((row) => row.id === selectedId) : -1;
  if (resolvedIndex < 0 && filtered.length) {
    resolvedIndex = Math.max(0, Math.min(filtered.length - 1, Number(selectedIndex) || 0));
  }
  if (!filtered.length) resolvedIndex = -1;
  const selected = resolvedIndex >= 0 ? filtered[resolvedIndex] : null;

  const liveRows = source.filter((row) => row.state === 'LIVE');
  const endedRows = source.filter((row) => row.state === 'ENDED');
  const unknownRows = source.filter((row) => row.state !== 'LIVE' && row.state !== 'ENDED');
  const pressures = source.map((row) => ({ row, value: rowContextPercent(row) })).filter((item) => item.value != null);
  pressures.sort((a, b) => b.value - a.value);

  return {
    rows: filtered,
    selected,
    selectedIndex: resolvedIndex,
    query: { scope: normalizedScope, search: query, sortBy: normalizedSort, direction: normalizedDirection },
    summary: {
      total: source.length,
      live: liveRows.length,
      ended: endedRows.length,
      unknown: unknownRows.length,
      storageBytes: storageBytes(source),
      recentErrors: eventCount(source, 'recentErrors'),
      recentRetries: eventCount(source, 'recentRetries'),
      recentCompactions: eventCount(source, 'recentCompactions'),
      highestContextPercent: pressures[0]?.value ?? null,
      highestContextSessionId: pressures[0]?.row?.id ?? null,
      highestContextLabel: pressures[0] ? chartLabel(pressures[0].row) : null
    },
    charts: {
      tokens: rankedChart(filtered, rowTokenActivity, { limit: chartLimit }),
      context: rankedChart(filtered, rowContextPercent, { limit: chartLimit }),
      tools: rankedChart(filtered, rowToolActivity, { limit: chartLimit })
    }
  };
}
