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
  const glyphs = ascii ? ASCII : BLOCKS;
  const chars = entries.map((entry) => scaledGlyph(entry.value, min, max, glyphs));

  if (Array.isArray(markers) && markers.length && entries.length) {
    const firstAt = finiteOrNull(entries[0].point?.atMs);
    const lastAt = finiteOrNull(entries.at(-1).point?.atMs);
    if (firstAt != null && lastAt != null && lastAt > firstAt) {
      for (const marker of markers) {
        const atMs = finiteOrNull(marker?.atMs);
        if (atMs == null || atMs < firstAt || atMs > lastAt) continue;
        const index = Math.max(0, Math.min(chars.length - 1, Math.round(((atMs - firstAt) / (lastAt - firstAt)) * (chars.length - 1))));
        chars[index] = ascii ? '!' : '◆';
      }
    }
  }
  return chars.join('');
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
  const fill = ascii ? '#' : '█';
  const rest = ascii ? '.' : '·';
  return source.map((entry) => {
    const amount = Math.max(1, Math.round((entry.value / max) * barWidth));
    return {
      label: String(label(entry.item) ?? '--'),
      value: entry.value,
      bar: `${fill.repeat(amount)}${rest.repeat(Math.max(0, barWidth - amount))}`
    };
  });
}

export function contextChartModel(analytics, width = 56, { ascii = false } = {}) {
  const context = analytics?.context ?? {};
  return {
    line: sparkline(context.points, {
      width,
      accessor: (point) => point?.percent,
      ascii,
      markers: context.compactions
    }),
    currentPercent: context.currentUsed != null && context.currentWindow > 0
      ? (context.currentUsed / context.currentWindow) * 100
      : null,
    peakPercent: finiteOrNull(context.peakPercent),
    compactions: Array.isArray(context.compactions) ? context.compactions.length : 0
  };
}

export function cumulativeTokenChartModel(analytics, width = 56, { ascii = false } = {}) {
  const token = analytics?.tokens ?? {};
  return {
    line: sparkline(token.points, {
      width,
      accessor: (point) => point?.total,
      ascii
    }),
    total: finiteOrNull(token.total),
    input: finiteOrNull(token.input),
    cached: finiteOrNull(token.cached),
    uncachedInput: finiteOrNull(token.uncachedInput),
    output: finiteOrNull(token.output),
    reasoning: finiteOrNull(token.reasoning)
  };
}

export function tokenIoByTurnChartModel(analytics, width = 56, { ascii = false } = {}) {
  const turns = Array.isArray(analytics?.turns?.items) ? analytics.turns.items : [];
  return {
    line: sparkline(turns, {
      width,
      accessor: (turn) => turn?.totalTokens,
      ascii
    }),
    peakTokens: turns.reduce((max, turn) => Math.max(max, finiteOrNull(turn?.totalTokens) ?? 0), 0) || null,
    turns: turns.length
  };
}

export function turnDurationChartModel(analytics, width = 56, { ascii = false } = {}) {
  const turns = Array.isArray(analytics?.turns?.items) ? analytics.turns.items : [];
  return {
    line: sparkline(turns, {
      width,
      accessor: (turn) => turn?.durationMs,
      ascii
    }),
    completed: turns.filter((turn) => turn?.completed).length,
    maxDurationMs: turns.reduce((max, turn) => Math.max(max, finiteOrNull(turn?.durationMs) ?? 0), 0) || null
  };
}

export function toolCallsByTurnChartModel(analytics, width = 56, { ascii = false } = {}) {
  const turns = Array.isArray(analytics?.turns?.items) ? analytics.turns.items : [];
  return {
    line: sparkline(turns, {
      width,
      accessor: (turn) => turn?.toolCount,
      ascii
    }),
    peakCalls: turns.reduce((max, turn) => Math.max(max, finiteOrNull(turn?.toolCount) ?? 0), 0) || null,
    turns: turns.length
  };
}

export function toolShareChartModel(analytics, width = 28, { ascii = false, maxItems = 8 } = {}) {
  const byName = Array.isArray(analytics?.tools?.byName) ? analytics.tools.byName : [];
  return {
    bars: horizontalBars(byName, { width, maxItems, ascii }),
    total: finiteOrNull(analytics?.tools?.total) ?? 0
  };
}
