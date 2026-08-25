import path from 'node:path';
import { layoutSections, monitorRowBudget, REPRESENTATION, SECTION_TYPES } from './layout.js';
import { cellWidth, padCells, truncateCells } from './cell-width.js';
import { activityToken, paint } from './theme.js';

function value(metric, fallback = null) {
  if (metric && typeof metric === 'object' && Object.prototype.hasOwnProperty.call(metric, 'value')) return metric.value ?? fallback;
  return metric ?? fallback;
}

function finite(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function fmtNumber(raw) {
  const n = finite(raw);
  if (n == null) return '--';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n * 10) / 10);
}

function fmtBytes(raw) {
  const n = finite(raw);
  if (n == null || n < 0) return '--';
  if (n < 1_000) return `${Math.round(n)} B`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)} KB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)} MB`;
  if (n < 1_000_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  return `${(n / 1_000_000_000_000).toFixed(1)} TB`;
}

function fmtDuration(raw) {
  const n = finite(raw);
  if (n == null) return '--';
  if (n < 1000) return `${Math.round(n)}ms`;
  const seconds = Math.floor(n / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${seconds % 60 ? `${seconds % 60}s` : ''}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ''}`;
  const days = Math.floor(hours / 24);
  return `${days}d${hours % 24 ? `${hours % 24}h` : ''}`;
}

function epochLikeToMs(raw) {
  if (typeof raw === 'string' && /[a-z]/i.test(raw)) return null;
  let n = finite(raw);
  if (n == null || n <= 0) return null;
  if (n < 1e12) {
    while (n > 4_102_444_800) n /= 10;
    return n * 1000;
  }
  if (n < 1e15) return n;
  if (n < 1e18) return n / 1000;
  return n / 1_000_000;
}

function fmtReset(raw, nowMs) {
  if (typeof raw === 'string' && /[a-z]/i.test(raw)) return raw;
  const resetMs = epochLikeToMs(raw);
  if (resetMs == null) return null;
  const delta = resetMs - nowMs;
  if (delta <= 0) return 'now';
  const minutes = Math.max(1, Math.ceil(delta / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ''}`;
  const days = Math.floor(hours / 24);
  return `${days}d${hours % 24 ? `${hours % 24}h` : ''}`;
}

function pct(raw) {
  const n = finite(raw);
  return n == null ? '--' : `${Math.round(n)}%`;
}

function activityLabel(state) {
  const activity = String(value(state?.activity?.state, 'IDLE')).toUpperCase();
  const symbol = activity === 'ERROR' ? '×' : activity === 'APPROVAL' ? '!' : activity === 'TOOL' ? '◆' : '●';
  return { activity, text: `${symbol} ${activity}` };
}

function headerItem(item, state, options) {
  const { activity, text } = activityLabel(state);
  if (item === 'activity') return paint(text, activityToken(activity), options.theme);
  if (item === 'model') {
    const model = value(state?.model?.requested);
    return model ? paint(truncateCells(model, 18), 'thinking', options.theme) : null;
  }
  if (item === 'reasoning') {
    const reasoning = value(state?.model?.reasoning);
    return reasoning ? paint(truncateCells(reasoning, 10), 'reasoning', options.theme) : null;
  }
  if (item === 'project') return paint(truncateCells(options.projectName ?? path.basename(options.cwd ?? process.cwd()), 22), 'info', options.theme);
  if (item === 'auth') {
    const auth = value(state?.auth?.mode);
    return auth ? `AUTH ${paint(String(auth).toUpperCase(), 'info', options.theme)}` : null;
  }
  if (item === 'session-age') return fmtDuration(Math.max(0, options.nowMs - (state?.run?.startedAtMs ?? options.nowMs)));
  if (item === 'health') return options.health ?? null;
  if (item === 'fast') return options.fast ? 'FAST' : null;
  if (item === 'git') {
    const branch = value(state?.git?.branch);
    if (!branch) return options.gitLabel ?? null;
    const diff = value(state?.git?.diff);
    const ab = value(state?.git?.aheadBehind);
    const dirty = diff?.changedFiles ? ` *${diff.changedFiles}` : '';
    const remote = ab ? ` ↑${ab.ahead ?? '--'} ↓${ab.behind ?? '--'}` : '';
    return paint(truncateCells(`git:${branch}${dirty}${remote}`, 28), 'healthy', options.theme);
  }
  return null;
}

function bar(percent, cells = 10) {
  const n = finite(percent);
  if (n == null) return '─'.repeat(cells);
  const bounded = Math.max(0, Math.min(100, n));
  const filled = Math.round((bounded / 100) * cells);
  return `${'━'.repeat(filled)}${'─'.repeat(Math.max(0, cells - filled))}`;
}

function quotaLine(window, label, rep, width, nowMs) {
  const q = value(window);
  const remaining = finite(q?.remainingPercent);
  if (remaining == null) return `${label} waiting…`;
  const reset = fmtReset(q?.resetsAtMs ?? q?.resetsAt, nowMs);
  const suffix = reset ? ` ↻ ${reset}` : '';
  if (rep === REPRESENTATION.MICRO) return `${label} ${Math.round(remaining)}%`;
  if (rep === REPRESENTATION.COMPACT) return `${label} ${Math.round(remaining)}% left${suffix}`;
  const cells = Math.max(6, Math.min(18, width - 24));
  return `${label.padEnd(4)} ${bar(remaining, cells)} ${Math.round(remaining)}% left${suffix}`;
}

function sectionsFor(config, state) {
  const sections = [];
  if (config.sections.context) sections.push({ id: 'context', enabled: config.metrics.context !== false, type: SECTION_TYPES.REGULAR, minWidth: 22, preferredWidth: 34, estimatedHeight: 2, priority: 100 });
  if (value(state?.auth?.mode, 'unknown') === 'login' && config.metrics.quota !== false) sections.push({ id: 'quota', enabled: true, type: SECTION_TYPES.REGULAR, minWidth: 26, preferredWidth: 42, estimatedHeight: 2, priority: 98 });
  if (config.sections.activity) sections.push({ id: 'activity', enabled: config.metrics.activity !== false, type: SECTION_TYPES.SMALL, minWidth: 20, preferredWidth: 30, estimatedHeight: 1, priority: 95 });
  if (config.sections.usage) sections.push({ id: 'usage', enabled: config.metrics.usage !== false, type: SECTION_TYPES.REGULAR, minWidth: 28, preferredWidth: 42, estimatedHeight: 2, priority: 90 });
  if (config.sections.session) sections.push({ id: 'session', enabled: config.metrics.session !== false, type: SECTION_TYPES.SMALL, minWidth: 22, preferredWidth: 32, estimatedHeight: 2, priority: 80 });
  if (config.sections.system && config.metrics.system !== false) sections.push({ id: 'system', enabled: true, type: SECTION_TYPES.SMALL, minWidth: 22, preferredWidth: 32, estimatedHeight: 1, priority: 40 });
  return sections;
}

function compactLines(item, state, options) {
  const rep = item.representation;
  if (item.id === 'context') {
    const used = fmtNumber(value(state?.context?.usedTokens));
    const left = fmtNumber(value(state?.context?.leftTokens));
    const window = fmtNumber(value(state?.context?.windowTokens));
    if (rep === REPRESENTATION.MICRO) return [`CTX ${used}/${window}`];
    if (rep === REPRESENTATION.COMPACT) return [`CONTEXT ${used} used · ${left} left`];
    return ['CONTEXT', `${used} used · ${left} left · ${window} window`];
  }
  if (item.id === 'quota') {
    if (rep === REPRESENTATION.MICRO) return [`${quotaLine(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs)} · ${quotaLine(state?.quota?.weekly, 'W', rep, item.width, options.nowMs)}`];
    if (rep === REPRESENTATION.COMPACT) return [`${quotaLine(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs)} · ${quotaLine(state?.quota?.weekly, 'WEEK', rep, item.width, options.nowMs)}`];
    return [quotaLine(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs), quotaLine(state?.quota?.weekly, 'WEEK', rep, item.width, options.nowMs)];
  }
  if (item.id === 'activity') {
    const { activity, text } = activityLabel(state);
    const detail = truncateCells(value(state?.activity?.detail, ''), Math.max(8, item.width - 14));
    return [`${paint(text, activityToken(activity), options.theme)}${detail ? ` · ${detail}` : ''}`];
  }
  if (item.id === 'usage') {
    const input = fmtNumber(value(state?.usage?.inputTokens));
    const cached = fmtNumber(value(state?.usage?.cachedInputTokens));
    const output = fmtNumber(value(state?.usage?.outputTokens));
    const reasoning = fmtNumber(value(state?.usage?.reasoningTokens));
    if (rep === REPRESENTATION.MICRO) return [`TOK ${input}↑ ${output}↓`];
    if (rep === REPRESENTATION.COMPACT) return [`USAGE in ${input} · cache ${cached} · out ${output}`];
    return ['USAGE', `in ${input} · cached ${cached} · out ${output} · reasoning ${reasoning}`];
  }
  if (item.id === 'session') {
    const turns = fmtNumber(value(state?.session?.turnCount));
    const last = fmtDuration(value(state?.session?.lastTurnDurationMs));
    const lastEvent = finite(value(state?.session?.lastEventAtMs));
    const idle = lastEvent == null ? '--' : fmtDuration(Math.max(0, options.nowMs - lastEvent));
    if (rep === REPRESENTATION.MICRO) return [`SESSION ${turns}t · idle ${idle}`];
    if (rep === REPRESENTATION.COMPACT) return [`SESSION ${turns} turns · last ${last} · idle ${idle}`];
    return ['SESSION', `${turns} turns · last ${last} · idle ${idle} · compact ${fmtNumber(value(state?.compaction?.count))}`];
  }
  if (item.id === 'system') return [`SYSTEM CPU ${pct(value(state?.system?.cpuPercent))} · RAM ${fmtBytes(value(state?.system?.memoryBytes))}`];
  return [];
}

function mergeLanes(layout, state, options) {
  const laneRows = layout.lanes.map((lane) => {
    const rows = [];
    for (const item of lane.items) for (const line of compactLines(item, state, options)) rows.push(truncateCells(line, lane.width, ''));
    return rows;
  });
  const count = Math.min(layout.maxRows, Math.max(0, ...laneRows.map((rows) => rows.length)));
  const lines = [];
  for (let row = 0; row < count; row += 1) {
    lines.push(truncateCells(laneRows.map((rows, i) => padCells(rows[row] ?? '', layout.lanes[i].width)).join(' '), layout.width, ''));
  }
  return lines;
}

function distribute(total, count) {
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

function panelRow(cells, widths, theme) {
  const edge = paint('│', 'frame', theme);
  return `${edge}${cells.map((cell, i) => padCells(truncateCells(cell ?? '', widths[i], ''), widths[i])).join(edge)}${edge}`;
}

function separator(widths, theme, bottom = false) {
  const left = bottom ? '╰' : '├';
  const mid = bottom ? '┴' : '┼';
  const right = bottom ? '╯' : '┤';
  return paint(`${left}${widths.map((w) => '─'.repeat(w)).join(mid)}${right}`, 'frame', theme);
}

function titleBorder(width, label, theme) {
  const text = truncateCells(` ${label} `, width - 4, '');
  const dashes = Math.max(0, width - 3 - cellWidth(text));
  return `${paint('╭─', 'frame', theme)}${paint(text, 'info', theme)}${paint(`${'─'.repeat(dashes)}╮`, 'frame', theme)}`;
}

function contextPanel(state, width, theme) {
  const used = finite(value(state?.context?.usedTokens));
  const window = finite(value(state?.context?.windowTokens));
  const usedPercentMetric = finite(value(state?.context?.usedPercent));
  const usedPercent = usedPercentMetric ?? (used != null && window != null && window > 0 ? (used / window) * 100 : null);
  const cached = finite(value(state?.usage?.cachedInputTokens));
  const input = finite(value(state?.usage?.inputTokens));
  const cacheRatio = finite(value(state?.usage?.cacheRatio));
  const cachePercent = cacheRatio != null ? cacheRatio * 100 : (cached != null && input != null && input > 0 ? (cached / input) * 100 : null);
  const barCells = Math.max(6, Math.min(16, width - 20));
  return [
    `${paint(pct(usedPercent), 'thinking', theme)} used · ${fmtNumber(used)}/${fmtNumber(window)} · ${bar(usedPercent, barCells)}`,
    `CACHE ${paint(fmtNumber(cached), 'info', theme)} ${pct(cachePercent)} · LEFT ${pct(value(state?.context?.leftPercent))} · CMP ${paint(fmtNumber(value(state?.compaction?.count)), 'reasoning', theme)}`
  ];
}

function usagePanel(state, width, theme, nowMs) {
  const auth = value(state?.auth?.mode, 'unknown');
  const input = fmtNumber(value(state?.usage?.inputTokens));
  const output = fmtNumber(value(state?.usage?.outputTokens));
  const reasoning = fmtNumber(value(state?.usage?.reasoningTokens));
  const turnIn = fmtNumber(value(state?.usage?.turnInputTokens));
  const turnOut = fmtNumber(value(state?.usage?.turnOutputTokens));
  if (auth === 'login') return [
    quotaLine(state?.quota?.fiveHour, '5H', REPRESENTATION.COMPACT, width, nowMs),
    `${quotaLine(state?.quota?.weekly, 'WEEK', REPRESENTATION.MICRO, width, nowMs)} · IN ${input} · OUT ${output} · RSN ${paint(reasoning, 'reasoning', theme)} · TURN ${turnIn}/${turnOut}`
  ];
  return [`IN ${input} · OUT ${output} · RSN ${paint(reasoning, 'reasoning', theme)}`, `TURN ${turnIn}/${turnOut} · ACTUAL ${value(state?.model?.actual, '--')}`];
}

function sessionPanel(state, theme, nowMs, includeSystem) {
  const elapsed = fmtDuration(Math.max(0, nowMs - (state?.run?.startedAtMs ?? nowMs)));
  const last = fmtDuration(value(state?.session?.lastTurnDurationMs));
  const lastEvent = finite(value(state?.session?.lastEventAtMs));
  const update = lastEvent == null ? '--' : fmtDuration(Math.max(0, nowMs - lastEvent));
  const freshness = state?.session?.lastEventAtMs?.freshness ?? 'waiting';
  const second = includeSystem
    ? `last ${last} · update ${update} · CPU ${pct(value(state?.system?.cpuPercent))} · RAM ${fmtBytes(value(state?.system?.memoryBytes))}`
    : `last ${last} · update ${update} · data ${paint(freshness, 'healthy', theme)}`;
  return [`elapsed ${elapsed} · turns ${fmtNumber(value(state?.session?.turnCount))}`, second];
}

function activityPanel(state, theme) {
  const { activity, text } = activityLabel(state);
  const activeTools = value(state?.activity?.activeTools, []) ?? [];
  const detail = value(state?.activity?.detail, '');
  return [
    `${paint(text, activityToken(activity), theme)}${detail ? ` · ${detail}` : ''}`,
    `tools ${Array.isArray(activeTools) ? activeTools.length : '--'} · approval ${String(Boolean(value(state?.activity?.approvalPending, false)))} · retry ${fmtNumber(value(state?.activity?.retryCount))} · err ${fmtNumber(value(state?.activity?.errorCount))}`
  ];
}

function framedDashboard(state, config, width, options) {
  const theme = options.theme;
  const inner = width - 2;
  const widths = distribute(inner - 3, 4);
  const auth = value(state?.auth?.mode, 'unknown');
  const status = (config.header ?? []).map((item) => headerItem(item, state, options)).filter(Boolean).slice(0, 4).join(' · ');
  const headers = [
    paint('CONTEXT', 'info', theme),
    paint(`USAGE${auth === 'login' ? ' · LOGIN' : auth === 'api' ? ' · API' : ''}`, 'reasoning', theme),
    paint('SESSION', 'healthy', theme),
    paint('CURRENT ACTIVITY', 'thinking', theme)
  ];
  const columns = [
    contextPanel(state, widths[0], theme),
    usagePanel(state, widths[1], theme, options.nowMs),
    sessionPanel(state, theme, options.nowMs, config.sections.system && config.metrics.system !== false),
    activityPanel(state, theme)
  ];
  const edge = paint('│', 'frame', theme);
  return [
    titleBorder(width, `CODEX MONITOR · ${String(config.preset ?? 'recommended').toUpperCase()}`, theme),
    `${edge}${padCells(truncateCells(` ${status}`, inner, ''), inner)}${edge}`,
    separator(widths, theme),
    panelRow(headers, widths, theme),
    panelRow(columns.map((column) => column[0]), widths, theme),
    panelRow(columns.map((column) => column[1]), widths, theme),
    separator(widths, theme, true)
  ];
}

export function buildLiveFrame({
  state,
  config,
  width = 80,
  height = 24,
  cwd = process.cwd(),
  nowMs = Date.now(),
  projectName = null,
  health = 'WAITING',
  gitLabel = null,
  fast = false,
  previousLaneCount = null,
  hysteresisCells = 4
} = {}) {
  const safeWidth = Math.max(20, Number(width) || 80);
  const theme = config?.theme ?? 'color';
  const options = { theme, cwd, nowMs, projectName, health, gitLabel, fast };
  const sections = sectionsFor(config, state);
  const layout = layoutSections(sections, {
    width: safeWidth,
    height,
    maxRows: Math.max(1, monitorRowBudget(height) - 1),
    previousLaneCount,
    hysteresisCells
  });

  const framed = safeWidth >= 104 && monitorRowBudget(height) >= 7 && config?.preset === 'full';
  const frame = framed
    ? framedDashboard(state, config, safeWidth, options)
    : [truncateCells((config?.header ?? []).map((item) => headerItem(item, state, options)).filter(Boolean).slice(0, 4).join('  '), safeWidth, ''), ...mergeLanes(layout, state, options)];
  const budget = monitorRowBudget(height);
  return {
    lines: frame.slice(0, budget).map((line) => truncateCells(line, safeWidth, '')),
    rowCount: Math.min(frame.length, budget),
    layout,
    semantic: { activeTab: 'overview', authMode: value(state?.auth?.mode, 'unknown'), theme, interactive: false }
  };
}

export function assertNoWrap(frame, width) {
  return frame.lines.every((line) => cellWidth(line) <= width);
}

export { fmtBytes as formatBytes, fmtReset as formatQuotaReset };
