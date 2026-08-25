import path from 'node:path';
import { layoutSections, monitorRowBudget, REPRESENTATION, SECTION_TYPES } from './layout.js';
import { cellWidth, padCells, truncateCells } from './cell-width.js';
import { activityToken, paint } from './theme.js';

function value(metric, fallback = null) {
  if (metric && typeof metric === 'object' && Object.prototype.hasOwnProperty.call(metric, 'value')) return metric.value ?? fallback;
  return metric ?? fallback;
}

function fmtNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return '--';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '--';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n * 10) / 10);
}

function fmtBytes(raw) {
  if (raw === null || raw === undefined || raw === '') return '--';
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return '--';
  if (n < 1_000) return `${Math.round(n)} B`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)} KB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)} MB`;
  if (n < 1_000_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  return `${(n / 1_000_000_000_000).toFixed(1)} TB`;
}

function fmtDuration(ms) {
  if (ms === null || ms === undefined || ms === '') return '--';
  const n = Number(ms);
  if (!Number.isFinite(n)) return '--';
  if (n < 1000) return `${Math.round(n)}ms`;
  const seconds = Math.floor(n / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return `${minutes}m${remainder ? `${remainder}s` : ''}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ''}`;
  const days = Math.floor(hours / 24);
  return `${days}d${hours % 24 ? `${hours % 24}h` : ''}`;
}

function epochLikeToMs(raw) {
  if (typeof raw === 'string' && /[a-z]/i.test(raw)) return null;
  let n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1e12) {
    while (n > 4_102_444_800) n /= 10;
    return n * 1000;
  }
  if (n < 1e15) return n;
  if (n < 1e18) return n / 1000;
  return n / 1_000_000;
}

function fmtReset(rawMs, nowMs) {
  if (typeof rawMs === 'string' && /[a-z]/i.test(rawMs)) return rawMs;
  const resetMs = epochLikeToMs(rawMs);
  if (!Number.isFinite(resetMs)) return null;
  const delta = resetMs - nowMs;
  if (delta <= 0) return 'now';
  const minutes = Math.max(1, Math.ceil(delta / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 48) return `${hours}h${restMinutes ? `${restMinutes}m` : ''}`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return `${days}d${restHours ? `${restHours}h` : ''}`;
}

function pct(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? `${Math.round(n)}%` : '--';
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
    const model = value(state?.model?.requested, null);
    return model ? paint(truncateCells(model, 18), 'thinking', options.theme) : null;
  }
  if (item === 'reasoning') {
    const reasoning = value(state?.model?.reasoning, null);
    return reasoning ? paint(truncateCells(reasoning, 10), 'reasoning', options.theme) : null;
  }
  if (item === 'project') return paint(truncateCells(options.projectName ?? path.basename(options.cwd ?? process.cwd()), 22), 'info', options.theme);
  if (item === 'auth') {
    const auth = value(state?.auth?.mode, null);
    return auth ? `AUTH ${paint(String(auth).toUpperCase(), 'info', options.theme)}` : null;
  }
  if (item === 'session-age') return fmtDuration(Math.max(0, options.nowMs - (state?.run?.startedAtMs ?? options.nowMs)));
  if (item === 'health') return options.health ?? null;
  if (item === 'fast') return options.fast ? 'FAST' : null;
  if (item === 'git') {
    const branch = value(state?.git?.branch, null);
    const diff = value(state?.git?.diff, null);
    const aheadBehind = value(state?.git?.aheadBehind, null);
    if (!branch) return options.gitLabel ?? null;
    const dirty = diff?.changedFiles ? ` *${diff.changedFiles}` : '';
    const ab = aheadBehind ? ` ↑${aheadBehind.ahead ?? '--'} ↓${aheadBehind.behind ?? '--'}` : '';
    return paint(truncateCells(`git:${branch}${dirty}${ab}`, 28), 'healthy', options.theme);
  }
  return null;
}

function quotaBar(remainingPercent, cells = 10) {
  const remaining = Number(remainingPercent);
  if (!Number.isFinite(remaining)) return '─'.repeat(cells);
  const bounded = Math.max(0, Math.min(100, remaining));
  const filled = Math.round((bounded / 100) * cells);
  return `${'━'.repeat(filled)}${'─'.repeat(Math.max(0, cells - filled))}`;
}

function quotaLabel(window, label, representation, width = 40, nowMs = Date.now()) {
  const q = value(window);
  if (!q || !Number.isFinite(Number(q.remainingPercent))) return `${label} waiting…`;
  const remaining = Number(q.remainingPercent);
  if (representation === REPRESENTATION.MICRO) return `${label} ${Math.round(remaining)}%`;
  const resetText = fmtReset(q.resetsAtMs ?? q.resetsAt, nowMs);
  const reset = resetText ? ` ↻ ${resetText}` : '';
  if (representation === REPRESENTATION.COMPACT) return `${label} ${Math.round(remaining)}% left${reset}`;
  const barCells = Math.max(6, Math.min(18, width - 24));
  return `${label.padEnd(4)} ${quotaBar(remaining, barCells)} ${Math.round(remaining)}% left${reset}`;
}

function sectionDefinitions(config, state) {
  const authMode = value(state?.auth?.mode, 'unknown');
  const sections = [];
  if (config.sections.context) sections.push({ id: 'context', enabled: config.metrics.context !== false, type: SECTION_TYPES.REGULAR, minWidth: 22, preferredWidth: 34, estimatedHeight: 2, priority: 100 });
  if (config.sections.usage) sections.push({ id: 'usage', enabled: config.metrics.usage !== false, type: SECTION_TYPES.REGULAR, minWidth: 28, preferredWidth: 42, estimatedHeight: 2, priority: 90 });
  if (config.sections.session) sections.push({ id: 'session', enabled: config.metrics.session !== false, type: SECTION_TYPES.SMALL, minWidth: 22, preferredWidth: 32, estimatedHeight: 2, priority: 80 });
  if (config.sections.activity) sections.push({ id: 'activity', enabled: config.metrics.activity !== false, type: SECTION_TYPES.SMALL, minWidth: 20, preferredWidth: 30, estimatedHeight: 1, priority: 95 });
  if (authMode === 'login' && config.metrics.quota !== false) sections.push({ id: 'quota', enabled: true, type: SECTION_TYPES.REGULAR, minWidth: 26, preferredWidth: 42, estimatedHeight: 2, priority: 98 });
  if (config.sections.system && config.metrics.system !== false) sections.push({ id: 'system', enabled: true, type: SECTION_TYPES.SMALL, minWidth: 22, preferredWidth: 32, estimatedHeight: 1, priority: 40 });
  return sections;
}

function contentLines(item, state, options) {
  const rep = item.representation;
  if (item.id === 'context') {
    const used = fmtNumber(value(state?.context?.usedTokens));
    const left = fmtNumber(value(state?.context?.leftTokens));
    const window = fmtNumber(value(state?.context?.windowTokens));
    const percent = value(state?.context?.leftPercent);
    if (rep === REPRESENTATION.MICRO) return [`CTX ${Number.isFinite(percent) ? `${Math.round(percent)}% left` : `${used}/${window}`}`];
    if (rep === REPRESENTATION.COMPACT) return [`CONTEXT ${used} used · ${left} left`];
    return ['CONTEXT', `${used} used · ${left} left · ${window} window`];
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
    const compact = fmtNumber(value(state?.compaction?.count));
    const lastEventAtMs = Number(value(state?.session?.lastEventAtMs));
    const idle = Number.isFinite(lastEventAtMs) ? fmtDuration(Math.max(0, options.nowMs - lastEventAtMs)) : '--';
    if (rep === REPRESENTATION.MICRO) return [`SESSION ${turns}t · idle ${idle}`];
    if (rep === REPRESENTATION.COMPACT) return [`SESSION ${turns} turns · last ${last} · idle ${idle}`];
    return ['SESSION', `${turns} turns · last ${last} · idle ${idle} · compact ${compact}`];
  }
  if (item.id === 'activity') {
    const { activity, text } = activityLabel(state);
    const detail = truncateCells(value(state?.activity?.detail, ''), Math.max(8, item.width - 14));
    return [`${paint(text, activityToken(activity), options.theme)}${detail ? ` · ${detail}` : ''}`];
  }
  if (item.id === 'quota') {
    if (rep === REPRESENTATION.MICRO) return [`${quotaLabel(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs)} · ${quotaLabel(state?.quota?.weekly, 'W', rep, item.width, options.nowMs)}`];
    if (rep === REPRESENTATION.COMPACT) return [`${quotaLabel(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs)} · ${quotaLabel(state?.quota?.weekly, 'WEEK', rep, item.width, options.nowMs)}`];
    return [quotaLabel(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs), quotaLabel(state?.quota?.weekly, 'WEEK', rep, item.width, options.nowMs)];
  }
  if (item.id === 'system') {
    const cpu = value(state?.system?.cpuPercent);
    return [`SYSTEM CPU ${pct(cpu)} · RAM ${fmtBytes(value(state?.system?.memoryBytes))}`];
  }
  return [];
}

function mergeLaneRows(layout, state, options) {
  const laneRows = layout.lanes.map((lane) => {
    const rows = [];
    for (const item of lane.items) for (const line of contentLines(item, state, options)) rows.push(truncateCells(line, lane.width, ''));
    return rows;
  });
  const rowCount = Math.min(layout.maxRows, Math.max(0, ...laneRows.map((rows) => rows.length)));
  const lines = [];
  for (let row = 0; row < rowCount; row += 1) {
    const pieces = laneRows.map((rows, index) => padCells(rows[row] ?? '', layout.lanes[index].width));
    lines.push(truncateCells(pieces.join(' '), layout.width, ''));
  }
  return lines;
}

function distribute(total, count) {
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

function framedRow(cells, widths, theme) {
  const border = paint('│', 'frame', theme);
  return `${border}${cells.map((cell, i) => padCells(truncateCells(cell ?? '', widths[i], ''), widths[i])).join(border)}${border}`;
}

function framedSeparator(widths, theme, top = false, bottom = false) {
  const left = top ? '╭' : bottom ? '╰' : '├';
  const mid = top ? '┬' : bottom ? '┴' : '┼';
  const right = top ? '╮' : bottom ? '╯' : '┤';
  return paint(`${left}${widths.map((w) => '─'.repeat(w)).join(mid)}${right}`, 'frame', theme);
}

function titleBorder(width, label, theme) {
  const safeLabel = truncateCells(` ${label} `, Math.max(1, width - 2), '');
  const rest = Math.max(0, width - cellWidth(safeLabel) - 2);
  return `${paint('╭─', 'frame', theme)}${paint(safeLabel, 'info', theme)}${paint(`${'─'.repeat(Math.max(0, rest - 1))}╮`, 'frame', theme)}`;
}

function contextDashboard(state, width, theme) {
  const usedRaw = value(state?.context?.usedTokens);
  const windowRaw = value(state?.context?.windowTokens);
  const leftRaw = value(state?.context?.leftTokens);
  const usedPercentRaw = value(state?.context?.usedPercent);
  const usedPercent = Number.isFinite(Number(usedPercentRaw))
    ? Number(usedPercentRaw)
    : (Number.isFinite(Number(usedRaw)) && Number.isFinite(Number(windowRaw)) && Number(windowRaw) > 0 ? (Number(usedRaw) / Number(windowRaw)) * 100 : null);
  const cached = value(state?.usage?.cachedInputTokens);
  const input = value(state?.usage?.inputTokens);
  const cacheRatioRaw = value(state?.usage?.cacheRatio);
  const cachePercent = Number.isFinite(Number(cacheRatioRaw))
    ? Number(cacheRatioRaw) * 100
    : (Number.isFinite(Number(cached)) && Number.isFinite(Number(input)) && Number(input) > 0 ? (Number(cached) / Number(input)) * 100 : null);
  const barCells = Math.max(6, Math.min(18, width - 18));
  return [
    `${paint(pct(usedPercent), 'thinking', theme)} used · ${fmtNumber(usedRaw)}/${fmtNumber(windowRaw)} · ${quotaBar(100 - (usedPercent ?? 0), barCells)}`,
    `CACHE ${paint(fmtNumber(cached), 'info', theme)} ${pct(cachePercent)} · LEFT ${pct(value(state?.context?.leftPercent))} · CMP ${paint(fmtNumber(value(state?.compaction?.count)), 'reasoning', theme)}`
  ];
}

function usageDashboard(state, width, theme, nowMs) {
  const auth = value(state?.auth?.mode, 'unknown');
  const input = fmtNumber(value(state?.usage?.inputTokens));
  const output = fmtNumber(value(state?.usage?.outputTokens));
  const reasoning = fmtNumber(value(state?.usage?.reasoningTokens));
  const turnIn = fmtNumber(value(state?.usage?.turnInputTokens));
  const turnOut = fmtNumber(value(state?.usage?.turnOutputTokens));
  if (auth === 'login') {
    return [
      quotaLabel(state?.quota?.fiveHour, '5H', REPRESENTATION.COMPACT, width, nowMs),
      `${quotaLabel(state?.quota?.weekly, 'WEEK', REPRESENTATION.MICRO, width, nowMs)} · IN ${input} · OUT ${output} · RSN ${paint(reasoning, 'reasoning', theme)} · TURN ${turnIn}/${turnOut}`
    ];
  }
  return [
    `IN ${input} · OUT ${output} · RSN ${paint(reasoning, 'reasoning', theme)}`,
    `TURN ${turnIn}/${turnOut} · ACTUAL ${value(state?.model?.actual, '--')}`
  ];
}

function sessionDashboard(state, theme, nowMs, includeSystem) {
  const elapsed = fmtDuration(Math.max(0, nowMs - (state?.run?.startedAtMs ?? nowMs)));
  const last = fmtDuration(value(state?.session?.lastTurnDurationMs));
  const lastEvent = value(state?.session?.lastEventAtMs);
  const update = Number.isFinite(Number(lastEvent)) ? fmtDuration(Math.max(0, nowMs - Number(lastEvent))) : '--';
  const freshness = state?.session?.lastEventAtMs?.freshness ?? 'waiting';
  const second = includeSystem
    ? `last ${last} · update ${update} · CPU ${pct(value(state?.system?.cpuPercent))} · RAM ${fmtBytes(value(state?.system?.memoryBytes))}`
    : `last ${last} · update ${update} · data ${paint(freshness, 'healthy', theme)}`;
  return [`elapsed ${elapsed} · turns ${fmtNumber(value(state?.session?.turnCount))}`, second];
}

function activityDashboard(state, theme) {
  const { activity, text } = activityLabel(state);
  const detail = value(state?.activity?.detail, '');
  const activeTools = value(state?.activity?.activeTools, []) ?? [];
  return [
    `${paint(text, activityToken(activity), theme)}${detail ? ` · ${detail}` : ''}`,
    `tools ${Array.isArray(activeTools) ? activeTools.length : '--'} · approval ${String(Boolean(value(state?.activity?.approvalPending, false)))} · retry ${fmtNumber(value(state?.activity?.retryCount))} · err ${fmtNumber(value(state?.activity?.errorCount))}`
  ];
}

function buildFramedDashboard({ state, config, width, options }) {
  const theme = options.theme;
  const inner = width - 2;
  const panelWidths = distribute(inner - 3, 4);
  const statusItems = (config?.header ?? []).map((item) => headerItem(item, state, options)).filter(Boolean).slice(0, 4);
  const auth = value(state?.auth?.mode, 'unknown');
  const status = statusItems.join(' · ');
  const headers = [
    paint('CONTEXT', 'info', theme),
    paint(`USAGE${auth === 'login' ? ' · LOGIN' : auth === 'api' ? ' · API' : ''}`, 'reasoning', theme),
    paint('SESSION', 'healthy', theme),
    paint('CURRENT ACTIVITY', 'thinking', theme)
  ];
  const columns = [
    contextDashboard(state, panelWidths[0], theme),
    usageDashboard(state, panelWidths[1], theme, options.nowMs),
    sessionDashboard(state, theme, options.nowMs, config.sections.system && config.metrics.system !== false),
    activityDashboard(state, theme)
  ];
  return [
    titleBorder(width, `CODEX MONITOR · ${String(config.preset ?? 'recommended').toUpperCase()}`, theme),
    `${paint('│', 'frame', theme)}${padCells(truncateCells(` ${status}`, inner, ''), inner)}${paint('│', 'frame', theme)}`,
    framedSeparator(panelWidths, theme),
    framedRow(headers, panelWidths, theme),
    framedRow(columns.map((column) => column[0]), panelWidths, theme),
    framedRow(columns.map((column) => column[1]), panelWidths, theme),
    framedSeparator(panelWidths, theme, false, true)
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
  const sections = sectionDefinitions(config, state);
  const maxRows = Math.max(1, monitorRowBudget(height) - 1);
  const layout = layoutSections(sections, { width: safeWidth, height, maxRows, previousLaneCount, hysteresisCells });

  const canUseFramedBaseline = safeWidth >= 104 && monitorRowBudget(height) >= 7 && config?.preset === 'full';
  let frame;
  if (canUseFramedBaseline) {
    frame = buildFramedDashboard({ state, config, width: safeWidth, options });
  } else {
    const headerItems = (config?.header ?? []).map((item) => headerItem(item, state, options)).filter(Boolean).slice(0, 4);
    const header = truncateCells(headerItems.join('  '), safeWidth, '');
    frame = [header, ...mergeLaneRows(layout, state, options)];
  }

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
