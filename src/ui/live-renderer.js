import path from 'node:path';
import { layoutSections, monitorRowBudget, REPRESENTATION, SECTION_TYPES } from './layout.js';
import { cellWidth, padCells, truncateCells } from './cell-width.js';
import { activityToken, paint, styleText } from './theme.js';

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
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
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
  if (minutes < 60) return `${minutes}m${seconds % 60 ? String(seconds % 60).padStart(2, '0') + 's' : ''}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d${String(hours % 24).padStart(2, '0')}h`;
}

function fmtAge(raw, nowMs) {
  const timestamp = finite(raw);
  if (timestamp == null) return '--';
  return fmtDuration(Math.max(0, nowMs - timestamp));
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
  if (hours < 48) return `${hours}h${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d${String(hours % 24).padStart(2, '0')}h`;
}

function pct(raw) {
  const n = finite(raw);
  return n == null ? '--' : `${Math.round(n)}%`;
}

function activityInfo(state) {
  const activity = String(value(state?.activity?.state, 'IDLE')).toUpperCase();
  if (activity === 'ERROR') return { activity, symbol: '×', description: 'failed', token: 'error' };
  if (activity === 'APPROVAL') return { activity, symbol: '!', description: 'waiting approval', token: 'approval' };
  if (activity === 'TOOL') return { activity, symbol: '◆', description: 'running tool', token: 'tool' };
  if (activity === 'THINKING') return { activity, symbol: '●', description: 'reasoning', token: 'thinking' };
  return { activity: 'IDLE', symbol: '●', description: 'waiting input', token: 'healthy' };
}

function headerItem(item, state, options) {
  const info = activityInfo(state);
  if (item === 'activity') return `${styleText(`${info.symbol} ${info.activity}`, info.token, options.theme, { bold: true })} ${styleText(info.description, 'muted', options.theme)}`;
  if (item === 'model') {
    const model = value(state?.model?.requested);
    return model ? styleText(truncateCells(model, 20), 'thinking', options.theme, { bold: true }) : null;
  }
  if (item === 'reasoning') {
    const reasoning = value(state?.model?.reasoning);
    return reasoning ? styleText(truncateCells(reasoning, 12), 'reasoning', options.theme) : null;
  }
  if (item === 'project') return styleText(truncateCells(options.projectName ?? path.basename(options.cwd ?? process.cwd()), 26), 'info', options.theme);
  if (item === 'auth') {
    const auth = value(state?.auth?.mode);
    return auth ? `${styleText('AUTH', 'label', options.theme)} ${styleText(String(auth).toUpperCase(), auth === 'api' ? 'reasoning' : 'info', options.theme, { bold: true })}` : null;
  }
  if (item === 'session-age') return fmtDuration(Math.max(0, options.nowMs - (state?.run?.startedAtMs ?? options.nowMs)));
  if (item === 'health') return options.health ?? null;
  if (item === 'fast') return options.fast ? styleText('FAST', 'thinking', options.theme, { bold: true }) : null;
  if (item === 'git') {
    const branch = value(state?.git?.branch);
    if (!branch) return options.gitLabel ?? null;
    const diff = value(state?.git?.diff);
    const ab = value(state?.git?.aheadBehind);
    const dirtyCount = finite(diff?.changedFiles);
    const dirty = dirtyCount && dirtyCount > 0 ? ` +${dirtyCount}` : '';
    const remote = ab ? ` ↑${ab.ahead ?? '--'} ↓${ab.behind ?? '--'}` : '';
    return styleText(truncateCells(`git:${branch}${dirty}${remote}`, 34), 'healthy', options.theme);
  }
  return null;
}

function barToken(percent, { pressure = false } = {}) {
  const n = finite(percent);
  if (n == null) return 'frame';
  if (pressure) return n >= 80 ? 'error' : n >= 60 ? 'approval' : 'thinking';
  return n > 60 ? 'healthy' : n >= 20 ? 'approval' : 'error';
}

function bar(percent, cells = 10, theme = 'color', options = {}) {
  const n = finite(percent);
  const bounded = n == null ? 0 : Math.max(0, Math.min(100, n));
  const filled = n == null ? 0 : Math.round((bounded / 100) * cells);
  return `${paint('━'.repeat(filled), barToken(n, options), theme)}${paint('─'.repeat(Math.max(0, cells - filled)), 'frame', theme)}`;
}

function quotaLine(window, label, rep, width, nowMs, theme) {
  const q = value(window);
  const remaining = finite(q?.remainingPercent);
  if (remaining == null) return `${styleText(label, 'text', theme, { bold: true })} ${styleText('waiting…', 'muted', theme)}`;
  const reset = fmtReset(q?.resetsAtMs ?? q?.resetsAt, nowMs);
  const suffix = reset ? ` ${paint('↻', 'frame', theme)} ${styleText(reset, 'muted', theme)}` : '';
  if (rep === REPRESENTATION.MICRO) return `${label} ${Math.round(remaining)}%`;
  const cells = Math.max(6, Math.min(12, width - 25));
  return `${styleText(label, 'text', theme, { bold: true })} ${bar(remaining, cells, theme)} ${styleText(`${Math.round(remaining)}% left`, barToken(remaining), theme, { bold: true })}${suffix}`;
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
    if (rep === REPRESENTATION.MICRO) return [`${quotaLine(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs, options.theme)} · ${quotaLine(state?.quota?.weekly, 'W', rep, item.width, options.nowMs, options.theme)}`];
    return [quotaLine(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs, options.theme), quotaLine(state?.quota?.weekly, 'WEEK', rep, item.width, options.nowMs, options.theme)];
  }
  if (item.id === 'activity') {
    const info = activityInfo(state);
    const detail = truncateCells(value(state?.activity?.detail, ''), Math.max(8, item.width - 14));
    return [`${styleText(`${info.symbol} ${info.activity}`, info.token, options.theme, { bold: true })}${detail ? ` · ${detail}` : ''}`];
  }
  if (item.id === 'usage') {
    const input = fmtNumber(value(state?.usage?.inputTokens));
    const cached = fmtNumber(value(state?.usage?.cachedInputTokens));
    const output = fmtNumber(value(state?.usage?.outputTokens));
    if (rep === REPRESENTATION.MICRO) return [`TOK ${input}↑ ${output}↓`];
    if (rep === REPRESENTATION.COMPACT) return [`USAGE in ${input} · cache ${cached} · out ${output}`];
    return ['USAGE', `in ${input} · cached ${cached} · out ${output}`];
  }
  if (item.id === 'session') {
    const turns = fmtNumber(value(state?.session?.turnCount));
    const last = fmtDuration(value(state?.session?.lastTurnDurationMs));
    const idle = fmtAge(value(state?.session?.lastEventAtMs), options.nowMs);
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

function tableRow(cells, widths, theme) {
  const edge = paint('│', 'frame', theme);
  const body = cells.map((cell, i) => {
    const inner = Math.max(0, widths[i] - 2);
    return ` ${padCells(truncateCells(cell ?? '', inner, ''), inner)} `;
  }).join(edge);
  return `${edge}${body}${edge}`;
}

function horizontalBorder(left, mid, right, widths, theme) {
  return paint(`${left}${widths.map((width) => '─'.repeat(width)).join(mid)}${right}`, 'frame', theme);
}

function topBorder(width, preset, theme) {
  const prefix = '╭─';
  const suffix = '╮';
  const title = ` CODEX MONITOR · ${String(preset ?? 'recommended').toUpperCase()} `;
  const fill = Math.max(0, width - cellWidth(prefix) - cellWidth(title) - cellWidth(suffix));
  return `${paint(prefix, 'frame', theme)}${styleText(title, 'tool', theme, { bold: true })}${paint(`${'─'.repeat(fill)}${suffix}`, 'frame', theme)}`;
}

function summaryRow(state, config, width, options) {
  const items = (config.header ?? []).map((item) => headerItem(item, state, options)).filter(Boolean).slice(0, 4);
  const separator = ` ${paint('·', 'frame', options.theme)} `;
  const inner = Math.max(0, width - 4);
  const text = truncateCells(items.join(separator), inner, '');
  return `${paint('│', 'frame', options.theme)} ${padCells(text, inner)} ${paint('│', 'frame', options.theme)}`;
}

function contextColumn(state, width, theme) {
  const used = finite(value(state?.context?.usedTokens));
  const window = finite(value(state?.context?.windowTokens));
  const usedPercent = finite(value(state?.context?.usedPercent)) ?? (used != null && window != null && window > 0 ? (used / window) * 100 : null);
  const leftPercent = finite(value(state?.context?.leftPercent)) ?? (usedPercent == null ? null : 100 - usedPercent);
  const cached = finite(value(state?.usage?.cachedInputTokens));
  const input = finite(value(state?.usage?.inputTokens));
  const cacheRatio = finite(value(state?.usage?.cacheRatio));
  const cachePercent = cacheRatio != null ? cacheRatio * 100 : (cached != null && input != null && input > 0 ? (cached / input) * 100 : null);
  const barWidth = Math.max(6, Math.min(28, width - 4));
  return [
    `${styleText(`${pct(usedPercent)} used`, barToken(usedPercent, { pressure: true }), theme, { bold: true })} ${paint('·', 'frame', theme)} ${styleText(`${fmtNumber(used)}/${fmtNumber(window)}`, 'bright', theme)}`,
    bar(usedPercent, barWidth, theme, { pressure: true }),
    `${styleText('CACHE', 'label', theme)} ${styleText(fmtNumber(cached), 'info', theme)}${cachePercent == null ? '' : ` ${styleText(pct(cachePercent), 'info', theme)}`}`,
    `${styleText('LEFT', 'label', theme)} ${styleText(pct(leftPercent), 'bright', theme)} ${paint('·', 'frame', theme)} ${styleText('CMP', 'label', theme)} ${styleText(fmtNumber(value(state?.compaction?.count)), 'reasoning', theme)}`
  ];
}

function usageColumn(state, width, theme, nowMs) {
  const auth = value(state?.auth?.mode, 'unknown');
  const input = fmtNumber(value(state?.usage?.inputTokens));
  const cached = fmtNumber(value(state?.usage?.cachedInputTokens));
  const output = fmtNumber(value(state?.usage?.outputTokens));
  const reasoning = fmtNumber(value(state?.usage?.reasoningTokens));
  const turnInput = fmtNumber(value(state?.usage?.turnInputTokens));
  const turnOutput = fmtNumber(value(state?.usage?.turnOutputTokens));
  const sep = ` ${paint('·', 'frame', theme)} `;

  if (auth === 'login') return [
    quotaLine(state?.quota?.fiveHour, '5H', REPRESENTATION.FULL, width, nowMs, theme),
    quotaLine(state?.quota?.weekly, 'WEEK', REPRESENTATION.FULL, width, nowMs, theme),
    `${styleText('IN', 'label', theme)} ${styleText(input, 'bright', theme)}${sep}${styleText('CACHE', 'label', theme)} ${styleText(cached, 'info', theme)}${sep}${styleText('OUT', 'label', theme)} ${styleText(output, 'tool', theme)}`,
    `${styleText('RSN', 'label', theme)} ${styleText(reasoning, 'reasoning', theme)}${sep}${styleText('TURN', 'label', theme)} ${styleText(`${turnInput} in / ${turnOutput} out`, 'thinking', theme)}`
  ];

  const requested = value(state?.model?.requested, '--');
  const actual = value(state?.model?.actual, null);
  return [
    `${styleText('MODEL', 'label', theme)} ${styleText(requested, 'thinking', theme, { bold: true })}`,
    `${styleText('ACTUAL', 'label', theme)} ${styleText(actual ?? 'waiting…', actual ? 'healthy' : 'muted', theme, { bold: Boolean(actual) })}`,
    `${styleText('IN', 'label', theme)} ${styleText(input, 'bright', theme)}${sep}${styleText('CACHE', 'label', theme)} ${styleText(cached, 'info', theme)}${sep}${styleText('OUT', 'label', theme)} ${styleText(output, 'tool', theme)}`,
    `${styleText('RSN', 'label', theme)} ${styleText(reasoning, 'reasoning', theme)}${sep}${styleText('TURN', 'label', theme)} ${styleText(`${turnInput} in / ${turnOutput} out`, 'thinking', theme)}`
  ];
}

function sessionColumn(state, config, theme, nowMs) {
  const sep = ` ${paint('·', 'frame', theme)} `;
  const elapsed = fmtDuration(Math.max(0, nowMs - (state?.run?.startedAtMs ?? nowMs)));
  const turns = fmtNumber(value(state?.session?.turnCount));
  const last = fmtDuration(value(state?.session?.lastTurnDurationMs));
  const update = fmtAge(value(state?.session?.lastEventAtMs), nowMs);
  const thread = String(value(state?.session?.threadId, '--') ?? '--').slice(0, 12);
  const bound = Boolean(value(state?.session?.bound, false));
  const freshness = state?.session?.lastEventAtMs?.freshness ?? 'waiting';
  const systemEnabled = config.sections.system && config.metrics.system !== false;
  const system = systemEnabled
    ? `${sep}${styleText('SYS', 'label', theme)} ${styleText(`${pct(value(state?.system?.cpuPercent))} / ${fmtBytes(value(state?.system?.memoryBytes))}`, 'info', theme)}`
    : '';
  return [
    `${styleText('elapsed', 'label', theme)} ${styleText(elapsed, 'bright', theme)}${sep}${styleText('turns', 'label', theme)} ${styleText(turns, 'bright', theme)}`,
    `${styleText('last', 'label', theme)} ${styleText(last, 'thinking', theme)}${sep}${styleText('update', 'label', theme)} ${styleText(update, 'muted', theme)}`,
    `${styleText('thread', 'label', theme)} ${styleText(thread, 'info', theme)}${sep}${styleText('fresh', 'label', theme)} ${styleText(String(freshness), freshness === 'current' ? 'healthy' : 'muted', theme)}`,
    `${styleText('data', 'label', theme)} ${styleText(bound ? 'current rollout' : 'waiting current rollout', bound ? 'healthy' : 'approval', theme)}${system}`
  ];
}

function activityColumn(state, theme) {
  const info = activityInfo(state);
  const sep = ` ${paint('·', 'frame', theme)} `;
  const detail = value(state?.activity?.detail, info.description) || info.description;
  const source = value(state?.activity?.source, 'runtime') || 'runtime';
  const activeTools = value(state?.activity?.activeTools, null);
  const activeToolCount = Array.isArray(activeTools) ? activeTools.length : finite(activeTools);
  const currentTool = value(state?.tools?.current, null);
  const lastTool = value(state?.tools?.last, null);
  const toolName = currentTool?.name ?? currentTool?.tool ?? lastTool?.name ?? lastTool?.tool ?? '--';
  const approval = Boolean(value(state?.activity?.approvalPending, false));
  const retry = fmtNumber(value(state?.activity?.retryCount));
  const errors = fmtNumber(value(state?.activity?.errorCount));
  return [
    `${styleText(`${info.symbol} ${info.activity}`, info.token, theme, { bold: true })} ${styleText(info.description, 'muted', theme)}`,
    `${styleText('source', 'label', theme)} ${styleText(String(source), 'bright', theme)}${sep}${styleText('detail', 'label', theme)} ${styleText(String(detail), 'muted', theme)}`,
    `${styleText('tools', 'label', theme)} ${styleText(activeToolCount == null ? '--' : String(activeToolCount), 'tool', theme)}${sep}${styleText('last', 'label', theme)} ${styleText(String(toolName), 'info', theme)}`,
    `${styleText('approval', 'label', theme)} ${styleText(String(approval), approval ? 'approval' : 'muted', theme)}${sep}${styleText('retry', 'label', theme)} ${styleText(retry, 'approval', theme)}${sep}${styleText('err', 'label', theme)} ${styleText(errors, finite(value(state?.activity?.errorCount)) > 0 ? 'error' : 'muted', theme)}`
  ];
}

function fullDashboard(state, config, width, options) {
  const theme = options.theme;
  const available = width - 5;
  const widths = distribute(available, 4);
  const auth = value(state?.auth?.mode, 'unknown');
  const titles = [
    styleText('CONTEXT', 'info', theme, { bold: true }),
    styleText(`USAGE${auth === 'login' ? ' · LOGIN' : auth === 'api' ? ' · API' : ''}`, 'reasoning', theme, { bold: true }),
    styleText('SESSION', 'healthy', theme, { bold: true }),
    styleText('CURRENT ACTIVITY', 'thinking', theme, { bold: true })
  ];
  const columns = [
    contextColumn(state, widths[0], theme),
    usageColumn(state, widths[1], theme, options.nowMs),
    sessionColumn(state, config, theme, options.nowMs),
    activityColumn(state, theme)
  ];
  const lines = [
    topBorder(width, config.preset, theme),
    summaryRow(state, config, width, options),
    horizontalBorder('├', '┬', '┤', widths, theme),
    tableRow(titles, widths, theme)
  ];
  for (let row = 0; row < 4; row += 1) lines.push(tableRow(columns.map((column) => column[row] ?? ''), widths, theme));
  lines.push(horizontalBorder('╰', '┴', '╯', widths, theme));
  return lines;
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

  // The Full wide representation deliberately mirrors the visual language of
  // feat/full-monitor-v2. Only the renderer is borrowed; state, collectors,
  // provenance, passive keyboard ownership and demand rules remain v1-rearchitecture.
  const useFullVisual = safeWidth >= 120 && height >= 18 && config?.preset === 'full';
  const frame = useFullVisual
    ? fullDashboard(state, config, safeWidth, options)
    : [
      truncateCells((config?.header ?? []).map((item) => headerItem(item, state, options)).filter(Boolean).slice(0, 4).join(` ${paint('·', 'frame', theme)} `), safeWidth, ''),
      ...mergeLanes(layout, state, options)
    ];
  const budget = monitorRowBudget(height);
  return {
    lines: frame.slice(0, budget).map((line) => truncateCells(line, safeWidth, '')),
    rowCount: Math.min(frame.length, budget),
    layout,
    semantic: { activeTab: 'overview', authMode: value(state?.auth?.mode, 'unknown'), theme, interactive: false, visual: useFullVisual ? 'full-monitor-v2' : 'responsive-compact' }
  };
}

export function assertNoWrap(frame, width) {
  return frame.lines.every((line) => cellWidth(line) <= width);
}

export { fmtBytes as formatBytes, fmtReset as formatQuotaReset };
