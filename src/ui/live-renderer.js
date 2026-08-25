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
  let n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Codex protocol documents resets_at as Unix seconds. Be defensive about
  // historical/client encodings that may arrive as deciseconds, milliseconds,
  // microseconds, or nanoseconds.
  if (n < 1e12) {
    while (n > 4_102_444_800) n /= 10; // bring implausible >2100 seconds back to epoch seconds
    return n * 1000;
  }
  if (n < 1e15) return n;
  if (n < 1e18) return n / 1000;
  return n / 1_000_000;
}

function fmtReset(rawMs, nowMs) {
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
    return model ? truncateCells(model, 18) : null;
  }
  if (item === 'reasoning') {
    const reasoning = value(state?.model?.reasoning, null);
    return reasoning ? truncateCells(reasoning, 10) : null;
  }
  if (item === 'project') return truncateCells(options.projectName ?? path.basename(options.cwd ?? process.cwd()), 18);
  if (item === 'auth') {
    const auth = value(state?.auth?.mode, null);
    return auth ? String(auth).toUpperCase() : null;
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
    return truncateCells(`git:${branch}${dirty}${ab}`, 24);
  }
  return null;
}

function quotaBar(remainingPercent, cells = 10) {
  const remaining = Math.max(0, Math.min(100, Number(remainingPercent)));
  if (!Number.isFinite(remaining)) return '─'.repeat(cells);
  const filled = Math.round((remaining / 100) * cells);
  return `${'━'.repeat(filled)}${'─'.repeat(Math.max(0, cells - filled))}`;
}

function quotaLabel(window, label, representation, width = 40, nowMs = Date.now()) {
  const q = value(window);
  if (!q) return `${label} n/a`;
  const remaining = Number(q.remainingPercent);
  if (!Number.isFinite(remaining)) return `${label} n/a`;
  if (representation === REPRESENTATION.MICRO) return `${label} ${Math.round(remaining)}%`;

  const resetAt = q.resetsAtMs ?? q.resetsAt;
  const resetText = fmtReset(resetAt, nowMs);
  const reset = resetText ? ` ↻ ${resetText}` : '';

  if (representation === REPRESENTATION.COMPACT) {
    return `${label} ${Math.round(remaining)}% left${reset}`;
  }
  const barCells = Math.max(6, Math.min(18, width - 24));
  return `${label.padEnd(4)} ${quotaBar(remaining, barCells)} ${Math.round(remaining)}% left${reset}`;
}

function sectionDefinitions(config, state) {
  const authMode = value(state?.auth?.mode, 'unknown');
  const sections = [];
  if (config.sections.context) sections.push({ id: 'context', enabled: config.metrics.context !== false, type: SECTION_TYPES.REGULAR, minWidth: 22, preferredWidth: 34, maxWidth: 52, estimatedHeight: 2, priority: 100, stretchWeight: 2 });
  if (config.sections.usage) sections.push({ id: 'usage', enabled: config.metrics.usage !== false, type: SECTION_TYPES.REGULAR, minWidth: 28, preferredWidth: 42, maxWidth: 64, estimatedHeight: 2, priority: 90, stretchWeight: 2 });
  if (config.sections.session) sections.push({ id: 'session', enabled: config.metrics.session !== false, type: SECTION_TYPES.SMALL, minWidth: 22, preferredWidth: 32, maxWidth: 48, estimatedHeight: 2, priority: 80, stretchWeight: 1 });
  if (config.sections.activity) sections.push({ id: 'activity', enabled: config.metrics.activity !== false, type: SECTION_TYPES.SMALL, minWidth: 20, preferredWidth: 30, maxWidth: 44, estimatedHeight: 1, priority: 95, stretchWeight: 1 });
  if (authMode === 'login' && config.metrics.quota !== false) sections.push({ id: 'quota', enabled: true, type: SECTION_TYPES.REGULAR, minWidth: 26, preferredWidth: 42, maxWidth: 60, estimatedHeight: 2, priority: 98, stretchWeight: 2 });
  if (config.sections.system && config.metrics.system !== false) sections.push({ id: 'system', enabled: true, type: SECTION_TYPES.SMALL, minWidth: 22, preferredWidth: 32, maxWidth: 44, estimatedHeight: 1, priority: 40, stretchWeight: 1 });
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
    const compactRaw = Number(value(state?.compaction?.count, 0));
    const compact = Number.isFinite(compactRaw) ? compactRaw : 0;
    const lastEventAtMs = Number(value(state?.session?.lastEventAtMs));
    const idle = Number.isFinite(lastEventAtMs)
      ? fmtDuration(Math.max(0, options.nowMs - lastEventAtMs))
      : '--';
    if (rep === REPRESENTATION.MICRO) return [`SESSION ${turns}t · idle ${idle}`];
    if (rep === REPRESENTATION.COMPACT) return [`SESSION ${turns} turns · last turn ${last} · idle ${idle}`];
    return ['SESSION', `${turns} turns · last turn ${last} · idle ${idle} · compact ${compact}`];
  }
  if (item.id === 'activity') {
    const { activity, text } = activityLabel(state);
    const detail = truncateCells(value(state?.activity?.detail, ''), Math.max(8, item.width - 14));
    return [`${paint(text, activityToken(activity), options.theme)}${detail ? ` · ${detail}` : ''}`];
  }
  if (item.id === 'quota') {
    if (rep === REPRESENTATION.MICRO) return [`${quotaLabel(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs)} · ${quotaLabel(state?.quota?.weekly, 'W', rep, item.width, options.nowMs)}`];
    if (rep === REPRESENTATION.COMPACT) return [`${quotaLabel(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs)} · ${quotaLabel(state?.quota?.weekly, 'WEEK', rep, item.width, options.nowMs)}`];
    return [
      quotaLabel(state?.quota?.fiveHour, '5H', rep, item.width, options.nowMs),
      quotaLabel(state?.quota?.weekly, 'WEEK', rep, item.width, options.nowMs)
    ];
  }
  if (item.id === 'system') {
    const cpu = Number(value(state?.system?.cpuPercent));
    const ram = value(state?.system?.memoryBytes);
    return [`SYSTEM CPU ${Number.isFinite(cpu) ? `${Math.round(cpu)}%` : '--'} · RAM ${fmtBytes(ram)}`];
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
  cwd = process.cwd(),
  nowMs = Date.now(),
  projectName = null,
  health = 'WAITING',
  gitLabel = null,
  fast = false,
  previousLaneCount = null,
  hysteresisCells = 4
} = {}) {
  const theme = config?.theme ?? 'color';
  const options = { theme, cwd, nowMs, projectName, health, gitLabel, fast };
  const left = (config?.header ?? []).map((item) => headerItem(item, state, options)).filter(Boolean).slice(0, 4);
  const header = truncateCells(left.join('  '), width, '');

  // Live HUD is intentionally a single, non-interactive dashboard. Keeping all
  // keyboard ownership inside Codex avoids conflicts with Codex's own TUI keymap.
  const maxRows = Math.max(1, monitorRowBudget(height) - 1);
  const sections = sectionDefinitions(config, state);
  const layout = layoutSections(sections, { width, height, maxRows, previousLaneCount, hysteresisCells });
  const body = mergeLaneRows(layout, state, options);
  const frame = [header, ...body];
  return {
    lines: frame.slice(0, monitorRowBudget(height)),
    rowCount: Math.min(frame.length, monitorRowBudget(height)),
    layout,
    semantic: { activeTab: 'overview', authMode: value(state?.auth?.mode, 'unknown'), theme }
  };
}

export function assertNoWrap(frame, width) {
  return frame.lines.every((line) => cellWidth(line) <= width);
}

export { fmtBytes as formatBytes, fmtReset as formatQuotaReset };
