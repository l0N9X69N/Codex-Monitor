import path from 'node:path';
import { fitHeader, layoutSections, monitorRowBudget, REPRESENTATION, SECTION_TYPES } from './layout.js';
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
  return String(n);
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
  return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ''}`;
}

function activityLabel(state) {
  const activity = String(value(state?.activity?.state, 'IDLE')).toUpperCase();
  const symbol = activity === 'ERROR' ? '×' : activity === 'APPROVAL' ? '!' : activity === 'TOOL' ? '◆' : '●';
  return { activity, text: `${symbol} ${activity}` };
}

function headerItem(item, state, options) {
  const { activity, text } = activityLabel(state);
  if (item === 'activity') return paint(text, activityToken(activity), options.theme);
  if (item === 'model') return truncateCells(value(state?.model?.requested, '--'), 18);
  if (item === 'reasoning') return truncateCells(value(state?.model?.reasoning, '--'), 10);
  if (item === 'project') return truncateCells(options.projectName ?? path.basename(options.cwd ?? process.cwd()), 18);
  if (item === 'auth') return String(value(state?.auth?.mode, 'unknown')).toUpperCase();
  if (item === 'session-age') return fmtDuration(Math.max(0, options.nowMs - (state?.run?.startedAtMs ?? options.nowMs)));
  if (item === 'health') return options.health ?? 'WAITING';
  if (item === 'fast') return options.fast ? 'FAST' : null;
  if (item === 'git') return options.gitLabel ?? 'git';
  return null;
}

function quotaBar(remainingPercent, cells = 10) {
  const remaining = Math.max(0, Math.min(100, Number(remainingPercent)));
  if (!Number.isFinite(remaining)) return '─'.repeat(cells);
  const filled = Math.round((remaining / 100) * cells);
  return `${'━'.repeat(filled)}${'─'.repeat(Math.max(0, cells - filled))}`;
}

function quotaLabel(window, label, representation, width = 40) {
  const q = value(window);
  if (!q) return `${label} --`;
  const remaining = Number(q.remainingPercent);
  if (!Number.isFinite(remaining)) return `${label} --`;
  if (representation === REPRESENTATION.MICRO) return `${label} ${Math.round(remaining)}%`;
  const reset = q.resetsAt ? ` ↻ ${q.resetsAt}` : '';
  if (representation === REPRESENTATION.COMPACT) return `${label} ${Math.round(remaining)}% left`;
  const barCells = Math.max(6, Math.min(18, width - 24));
  return `${label.padEnd(4)} ${quotaBar(remaining, barCells)} ${Math.round(remaining)}% left${reset}`;
}

function sectionDefinitions(config, state) {
  const authMode = value(state?.auth?.mode, 'unknown');
  const sections = [];
  if (config.sections.context) sections.push({
    id: 'context', enabled: config.metrics.context !== false, type: SECTION_TYPES.REGULAR,
    minWidth: 22, preferredWidth: 34, maxWidth: 52, estimatedHeight: 2, priority: 100, stretchWeight: 2
  });
  if (config.sections.usage) sections.push({
    id: 'usage', enabled: config.metrics.usage !== false, type: SECTION_TYPES.REGULAR,
    minWidth: 28, preferredWidth: 42, maxWidth: 64, estimatedHeight: 2, priority: 90, stretchWeight: 2
  });
  if (config.sections.session) sections.push({
    id: 'session', enabled: config.metrics.session !== false, type: SECTION_TYPES.SMALL,
    minWidth: 22, preferredWidth: 32, maxWidth: 44, estimatedHeight: 2, priority: 80, stretchWeight: 1
  });
  if (config.sections.activity) sections.push({
    id: 'activity', enabled: config.metrics.activity !== false, type: SECTION_TYPES.SMALL,
    minWidth: 20, preferredWidth: 30, maxWidth: 44, estimatedHeight: 1, priority: 95, stretchWeight: 1
  });
  if (authMode === 'login' && config.metrics.quota !== false) sections.push({
    id: 'quota', enabled: true, type: SECTION_TYPES.REGULAR,
    minWidth: 26, preferredWidth: 42, maxWidth: 60, estimatedHeight: 2, priority: 98, stretchWeight: 2
  });
  if (config.sections.system && config.metrics.system !== false) sections.push({
    id: 'system', enabled: true, type: SECTION_TYPES.SMALL,
    minWidth: 22, preferredWidth: 32, maxWidth: 44, estimatedHeight: 1, priority: 40, stretchWeight: 1
  });
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
    if (rep === REPRESENTATION.MICRO) return [`SESSION ${turns}t`];
    if (rep === REPRESENTATION.COMPACT) return [`SESSION ${turns} turns · last ${last}`];
    return ['SESSION', `${turns} turns · last ${last} · compact ${compact}`];
  }
  if (item.id === 'activity') {
    const { activity, text } = activityLabel(state);
    const detail = truncateCells(value(state?.activity?.detail, ''), Math.max(8, item.width - 14));
    return [`${paint(text, activityToken(activity), options.theme)}${detail ? ` · ${detail}` : ''}`];
  }
  if (item.id === 'quota') {
    if (rep === REPRESENTATION.MICRO) return [`${quotaLabel(state?.quota?.fiveHour, '5H', rep)} · ${quotaLabel(state?.quota?.weekly, 'W', rep)}`];
    if (rep === REPRESENTATION.COMPACT) return [`${quotaLabel(state?.quota?.fiveHour, '5H', rep)} · ${quotaLabel(state?.quota?.weekly, 'WEEK', rep)}`];
    return [quotaLabel(state?.quota?.fiveHour, '5H', rep, item.width), quotaLabel(state?.quota?.weekly, 'WEEK', rep, item.width)];
  }
  if (item.id === 'system') {
    const cpu = value(state?.system?.cpuPercent);
    const ram = value(state?.system?.memoryBytes);
    return [`SYSTEM CPU ${Number.isFinite(cpu) ? `${Math.round(cpu)}%` : '--'} · RAM ${fmtNumber(ram)}`];
  }
  return [];
}

function mergeLaneRows(layout, state, options) {
  const laneRows = layout.lanes.map((lane) => {
    const rows = [];
    for (const item of lane.items) {
      for (const line of contentLines(item, state, options)) rows.push(truncateCells(line, lane.width, ''));
    }
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

export function buildLiveFrame({
  state,
  config,
  width = 80,
  height = 24,
  activeTab = 'overview',
  cwd = process.cwd(),
  nowMs = Date.now(),
  projectName = null,
  health = 'WAITING',
  gitLabel = null,
  fast = false
} = {}) {
  const theme = config?.theme ?? 'color';
  const options = { theme, cwd, nowMs, projectName, health, gitLabel, fast };
  const left = (config?.header ?? []).map((item) => headerItem(item, state, options)).filter(Boolean).slice(0, 4);
  const header = fitHeader({ left, tabs: config?.tabs ?? ['overview'], width, activeTab });
  const maxRows = Math.max(1, monitorRowBudget(height) - 2);
  const sections = activeTab === 'overview' ? sectionDefinitions(config, state) : [];
  const layout = layoutSections(sections, { width, height, maxRows });
  const body = activeTab === 'overview'
    ? mergeLaneRows(layout, state, options)
    : [truncateCells(`${String(activeTab).toUpperCase()} · Phase 04 foundation`, width, '')];
  const footer = truncateCells('F4 History', width, '');
  const frame = [header, ...body, footer];
  return {
    lines: frame.slice(0, monitorRowBudget(height)),
    rowCount: Math.min(frame.length, monitorRowBudget(height)),
    layout,
    semantic: { activeTab, authMode: value(state?.auth?.mode, 'unknown'), theme }
  };
}

export function assertNoWrap(frame, width) {
  return frame.lines.every((line) => cellWidth(line) <= width);
}
