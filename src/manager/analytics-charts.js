const BRAILLE = '⡀⡄⡆⡇⣇⣧⣷⣿';
const BLOCKS = '▁▂▃▄▅▆▇█';
const ASCII = ' .:-=+*#';

function finiteOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function seriesValues(points, accessor) {
  return (Array.isArray(points) ? points : [])
    .map((point, index) => ({ point, index, value: finiteOrNull(accessor(point)) }))
    .filter((entry) => entry.value != null);
}

function resample(entries, width) {
  if (!entries.length || width <= 0) return [];
  if (entries.length <= width) return entries;
  const output = [];
  for (let column = 0; column < width; column += 1) {
    const start = Math.floor((column * entries.length) / width);
    const end = Math.max(start + 1, Math.floor(((column + 1) * entries.length) / width));
    const bucket = entries.slice(start, Math.min(entries.length, end));
    let chosen = bucket[0];
    for (const entry of bucket) if (entry.value >= chosen.value) chosen = entry;
    output.push(chosen);
  }
  return output;
}

function scaledGlyph(value, min, max, glyphs) {
  if (max <= min) return glyphs[Math.floor((glyphs.length - 1) / 2)];
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return glyphs[Math.round(ratio * (glyphs.length - 1))];
}

function glyphSet({ ascii = false, width = 40 } = {}) {
  if (!ascii) return { glyphs: BRAILLE, marker: '◆', level: 'braille' };
  if (width >= 24) return { glyphs: BLOCKS, marker: '◆', level: 'block' };
  return { glyphs: ASCII, marker: '!', level: 'ascii' };
}

function markerColumns(entries, markers, width) {
  const columns = new Map();
  if (!Array.isArray(markers) || !markers.length || !entries.length) return columns;
  const firstAt = finiteOrNull(entries[0].point?.atMs);
  const lastAt = finiteOrNull(entries.at(-1).point?.atMs);
  if (firstAt == null || lastAt == null || lastAt <= firstAt) return columns;
  for (const marker of markers) {
    const atMs = finiteOrNull(marker?.atMs);
    if (atMs == null || atMs < firstAt || atMs > lastAt) continue;
    const column = Math.max(0, Math.min(width - 1, Math.round(((atMs - firstAt) / (lastAt - firstAt)) * (width - 1))));
    columns.set(column, marker);
  }
  return columns;
}

export function sparkline(points, {
  width = 40,
  accessor = (point) => point?.value,
  ascii = false,
  markers = []
} = {}) {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const entries = resample(seriesValues(points, accessor), safeWidth);
  if (!entries.length) return '--';
  const values = entries.map((entry) => entry.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const { glyphs, marker } = glyphSet({ ascii, width: safeWidth });
  const chars = entries.map((entry) => scaledGlyph(entry.value, min, max, glyphs));
  const markerMap = markerColumns(entries, markers, chars.length);
  for (const column of markerMap.keys()) chars[column] = marker;
  return chars.join('');
}

export function areaChartRows(points, {
  width = 40,
  height = 3,
  accessor = (point) => point?.value,
  ascii = false,
  markers = []
} = {}) {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.min(8, Math.floor(Number(height) || 1)));
  const entries = resample(seriesValues(points, accessor), safeWidth);
  if (!entries.length) return ['--'];

  const values = entries.map((entry) => entry.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const { glyphs, marker, level } = glyphSet({ ascii, width: safeWidth });
  const blank = ' ';
  const rows = Array.from({ length: safeHeight }, () => Array(entries.length).fill(blank));

  for (let column = 0; column < entries.length; column += 1) {
    const value = entries[column].value;
    const ratio = max <= min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
    const scaled = ratio * safeHeight;
    for (let row = safeHeight - 1; row >= 0; row -= 1) {
      const fromBottom = safeHeight - row - 1;
      const fill = scaled - fromBottom;
      if (fill >= 1) {
        rows[row][column] = glyphs.at(-1);
      } else if (fill > 0) {
        rows[row][column] = glyphs[Math.max(0, Math.min(glyphs.length - 1, Math.ceil(fill * (glyphs.length - 1))))];
      }
    }
    if (ratio === 0 && safeHeight > 0) rows[safeHeight - 1][column] = glyphs[0];
  }

  const markerMap = markerColumns(entries, markers, entries.length);
  for (const column of markerMap.keys()) {
    const value = entries[column]?.value ?? min;
    const ratio = max <= min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
    const row = Math.max(0, Math.min(safeHeight - 1, safeHeight - 1 - Math.round(ratio * (safeHeight - 1))));
    rows[row][column] = marker;
  }

  return rows.map((row) => row.join('').replace(/\s+$/g, '') || (level === 'ascii' ? '.' : '·'));
}

export function chartFallbackLevel({ ascii = false, width = 40 } = {}) {
  return glyphSet({ ascii, width: Math.max(1, Math.floor(Number(width) || 1)) }).level;
}

export function horizontalBars(items, {
  width = 32,
  maxItems = 8,
  label = (item) => item?.name ?? '--',
  value = (item) => item?.count,
  ascii = false
} = {}) {
  const source = (Array.isArray(items) ? items : [])
    .map((item) => ({ item, value: finiteOrNull(value(item)) ?? 0 }))
    .filter((entry) => entry.value > 0)
    .slice(0, Math.max(1, maxItems));
  if (!source.length) return [];
  const max = Math.max(...source.map((entry) => entry.value), 1);
  const barWidth = Math.max(4, Math.floor(Number(width) || 32));
  const fallback = glyphSet({ ascii, width: barWidth });
  const fill = fallback.level === 'ascii' ? '#' : '█';
  const rest = fallback.level === 'ascii' ? '.' : '·';
  return source.map((entry) => {
    const amount = Math.max(1, Math.round((entry.value / max) * barWidth));
    return {
      label: String(label(entry.item) ?? '--'),
      value: entry.value,
      bar: `${fill.repeat(amount)}${rest.repeat(Math.max(0, barWidth - amount))}`
    };
  });
}

function timeRange(points) {
  const source = Array.isArray(points) ? points : [];
  const valid = source.map((point) => finiteOrNull(point?.atMs)).filter((value) => value != null);
  return {
    firstAtMs: valid.length ? valid[0] : null,
    lastAtMs: valid.length ? valid.at(-1) : null
  };
}

export function contextChartModel(analytics, width = 56, { ascii = false, height = 4 } = {}) {
  const context = analytics?.context ?? {};
  return {
    line: sparkline(context.points, { width, accessor: (point) => point?.percent, ascii, markers: context.compactions }),
    rows: areaChartRows(context.points, { width, height, accessor: (point) => point?.percent, ascii, markers: context.compactions }),
    fallback: chartFallbackLevel({ ascii, width }),
    ...timeRange(context.points),
    currentPercent: context.currentUsed != null && context.currentWindow > 0 ? (context.currentUsed / context.currentWindow) * 100 : null,
    peakPercent: finiteOrNull(context.peakPercent),
    compactions: Array.isArray(context.compactions) ? context.compactions.length : 0
  };
}

export function cumulativeTokenChartModel(analytics, width = 56, { ascii = false, height = 2 } = {}) {
  const token = analytics?.tokens ?? {};
  return {
    line: sparkline(token.points, { width, accessor: (point) => point?.total, ascii }),
    rows: areaChartRows(token.points, { width, height, accessor: (point) => point?.total, ascii }),
    fallback: chartFallbackLevel({ ascii, width }),
    ...timeRange(token.points),
    total: finiteOrNull(token.total),
    input: finiteOrNull(token.input),
    cached: finiteOrNull(token.cached),
    uncachedInput: finiteOrNull(token.uncachedInput),
    output: finiteOrNull(token.output),
    reasoning: finiteOrNull(token.reasoning)
  };
}

export function tokenIoByTurnChartModel(analytics, width = 56, { ascii = false, height = 2 } = {}) {
  const turns = Array.isArray(analytics?.turns?.items) ? analytics.turns.items : [];
  return {
    line: sparkline(turns, { width, accessor: (turn) => turn?.totalTokens, ascii }),
    rows: areaChartRows(turns, { width, height, accessor: (turn) => turn?.totalTokens, ascii }),
    fallback: chartFallbackLevel({ ascii, width }),
    peakTokens: turns.reduce((max, turn) => Math.max(max, finiteOrNull(turn?.totalTokens) ?? 0), 0) || null,
    turns: turns.length
  };
}

export function turnDurationChartModel(analytics, width = 56, { ascii = false, height = 3 } = {}) {
  const turns = Array.isArray(analytics?.turns?.items) ? analytics.turns.items : [];
  return {
    line: sparkline(turns, { width, accessor: (turn) => turn?.durationMs, ascii }),
    rows: areaChartRows(turns, { width, height, accessor: (turn) => turn?.durationMs, ascii }),
    fallback: chartFallbackLevel({ ascii, width }),
    completed: turns.filter((turn) => turn?.completed).length,
    maxDurationMs: turns.reduce((max, turn) => Math.max(max, finiteOrNull(turn?.durationMs) ?? 0), 0) || null
  };
}

export function toolCallsByTurnChartModel(analytics, width = 56, { ascii = false, height = 2 } = {}) {
  const turns = Array.isArray(analytics?.turns?.items) ? analytics.turns.items : [];
  return {
    line: sparkline(turns, { width, accessor: (turn) => turn?.toolCount, ascii }),
    rows: areaChartRows(turns, { width, height, accessor: (turn) => turn?.toolCount, ascii }),
    fallback: chartFallbackLevel({ ascii, width }),
    peakCalls: turns.reduce((max, turn) => Math.max(max, finiteOrNull(turn?.toolCount) ?? 0), 0) || null,
    turns: turns.length
  };
}

export function toolShareChartModel(analytics, width = 28, { ascii = false, maxItems = 8 } = {}) {
  const byName = Array.isArray(analytics?.tools?.byName) ? analytics.tools.byName : [];
  return {
    bars: horizontalBars(byName, { width, maxItems, ascii }),
    fallback: chartFallbackLevel({ ascii, width }),
    total: finiteOrNull(analytics?.tools?.total) ?? 0
  };
}
