import {
  colorForRemaining,
  formatCountdown,
  formatTokens,
  monitorRowsForCols as liteRowsForCols,
  renderMonitor as renderLite,
  truncateAnsi
} from './render.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[38;2;34;197;94m';
const ORANGE = '\x1b[38;2;245;158;11m';
const RED = '\x1b[38;2;239;68;68m';
const CYAN = '\x1b[38;2;34;211;238m';
const BLUE = '\x1b[38;2;96;165;250m';
const PURPLE = '\x1b[38;2;192;132;252m';
const GOLD = '\x1b[38;2;250;204;21m';
const FRAME = '\x1b[38;2;71;85;105m';
const LABEL = '\x1b[38;2;100;116;139m';
const MUTED = '\x1b[38;2;148;163;184m';
const BRIGHT = '\x1b[38;2;226;232;240m';
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export const FULL_MIN_COLS = 120;
export const FULL_MIN_ROWS = 18;

function plain(value) {
  return String(value ?? '').replace(ANSI_RE, '');
}

function plainLength(value) {
  return [...plain(value)].length;
}

function padAnsi(value, width) {
  const clipped = truncateAnsi(String(value ?? ''), width);
  return `${clipped}${' '.repeat(Math.max(0, width - plainLength(clipped)))}`;
}

function sep() {
  return ` ${FRAME}·${RESET} `;
}

function metric(label, value, color = BRIGHT) {
  return `${LABEL}${label}${RESET} ${color}${value}${RESET}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d${String(hours % 24).padStart(2, '0')}h`;
}

function formatLatency(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--';
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, '')}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m${String(secs).padStart(2, '0')}s`;
}

function formatAge(timestampMs, nowMs) {
  if (!Number.isFinite(timestampMs)) return '--';
  const seconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function modelName(state, runtime) {
  return runtime?.observedModel || state?.meta?.model || 'Codex';
}

function reasoningName(state, runtime) {
  return runtime?.observedReasoning || state?.meta?.reasoningEffort || 'default';
}

function projectName(state, runtime) {
  return runtime?.project || state?.meta?.cwd?.split(/[\\/]/).filter(Boolean).at(-1) || 'workspace';
}

function contextUsedPercent(state) {
  const window = state?.usage?.contextWindow;
  const total = state?.usage?.last?.totalTokens;
  if (!Number.isFinite(window) || window <= 12_000) return null;
  if (!Number.isFinite(total)) return 0;
  const effective = window - 12_000;
  const used = Math.max(0, total - 12_000);
  return Math.max(0, Math.min(100, Math.round((used / effective) * 100)));
}

function compactBar(percent, width, color = ORANGE) {
  const segments = Math.max(4, width);
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.max(0, Math.min(segments, Math.round((pct / 100) * segments)));
  return `${color}${'━'.repeat(filled)}${RESET}${FRAME}${'─'.repeat(segments - filled)}${RESET}`;
}

function activityInfo(state) {
  const activity = String(state?.meta?.activityState || 'IDLE').toUpperCase();
  switch (activity) {
    case 'THINKING': return { symbol: '●', label: 'THINKING', description: 'reasoning', color: GOLD };
    case 'TOOL': return { symbol: '◆', label: 'TOOL', description: 'running tool', color: BLUE };
    case 'APPROVAL': return { symbol: '!', label: 'APPROVAL', description: 'waiting approval', color: ORANGE };
    case 'ERROR': return { symbol: '×', label: 'ERROR', description: 'failed', color: RED };
    default: return { symbol: '●', label: 'IDLE', description: 'waiting input', color: GREEN };
  }
}

function activityBadge(state) {
  const a = activityInfo(state);
  return `${a.color}${BOLD}${a.symbol} ${a.label}${RESET} ${MUTED}${a.description}${RESET}`;
}

function authBadge(runtime) {
  const auth = runtime?.profile?.auth === 'api' ? 'API' : 'LOGIN';
  const color = auth === 'API' ? PURPLE : CYAN;
  return `${LABEL}AUTH${RESET} ${color}${BOLD}${auth}${RESET}`;
}

function topBorder(cols) {
  const title = ' CODEX MONITOR · FULL ';
  const prefix = '╭─';
  const suffix = '╮';
  const fill = Math.max(0, cols - plainLength(prefix) - plainLength(title) - plainLength(suffix));
  return `${FRAME}${prefix}${RESET}${BLUE}${BOLD}${title}${RESET}${FRAME}${'─'.repeat(fill)}${suffix}${RESET}`;
}

function columnWidths(cols) {
  const available = Math.max(4, cols - 5); // outer borders + 3 vertical separators
  const base = Math.floor(available / 4);
  const extra = available % 4;
  return Array.from({ length: 4 }, (_, i) => base + (i < extra ? 1 : 0));
}

function horizontalBorder(left, mid, right, widths) {
  return `${FRAME}${left}${widths.map((w) => '─'.repeat(w)).join(mid)}${right}${RESET}`;
}

function tableRow(cells, widths) {
  const body = cells.map((cell, i) => {
    const inner = Math.max(0, widths[i] - 2);
    return ` ${padAnsi(cell, inner)} `;
  }).join(`${FRAME}│${RESET}`);
  return `${FRAME}│${RESET}${body}${FRAME}│${RESET}`;
}

function summaryRow(state, runtime, cols, nowMs) {
  const branch = runtime?.branch
    ? `${GREEN}git:${runtime.branch}${RESET}${runtime?.dirtyCount > 0 ? ` ${ORANGE}+${runtime.dirtyCount}${RESET}` : ''}`
    : `${LABEL}git:--${RESET}`;
  const items = [
    activityBadge(state),
    `${GOLD}${BOLD}${modelName(state, runtime)}${RESET}`,
    `${PURPLE}${reasoningName(state, runtime)}${RESET}`,
    `${CYAN}${projectName(state, runtime)}${RESET}`,
    branch,
    authBadge(runtime)
  ];
  const inner = Math.max(0, cols - 4);
  const line = truncateAnsi(items.join(sep()), inner);
  return `${FRAME}│${RESET} ${padAnsi(line, inner)} ${FRAME}│${RESET}`;
}

function quotaText(label, window, nowMs, width = 8) {
  if (!window) return `${BOLD}${label}${RESET} ${MUTED}waiting…${RESET}`;
  const remaining = Math.round(window.remainingPercent);
  const color = colorForRemaining(remaining);
  const barWidth = Math.max(6, Math.min(12, width));
  return `${BOLD}${label}${RESET} ${compactBar(remaining, barWidth, color)} ${color}${BOLD}${remaining}% left${RESET} ${FRAME}↻${RESET} ${MUTED}${formatCountdown(window.resetsAt, nowMs)}${RESET}`;
}

function contextColumn(state, width) {
  const used = contextUsedPercent(state);
  const window = state?.usage?.contextWindow;
  const current = state?.usage?.last?.totalTokens;
  const total = state?.usage?.total;
  const cached = total?.cachedInputTokens;
  const input = total?.inputTokens;
  const cachePct = Number.isFinite(input) && input > 0 && Number.isFinite(cached)
    ? Math.round((cached / input) * 100)
    : null;
  const usedColor = Number.isFinite(used) && used >= 80 ? RED : ORANGE;
  const barWidth = Math.max(6, Math.min(28, width - 2));

  return [
    `${usedColor}${BOLD}${Number.isFinite(used) ? `${used}% used` : '--'}${RESET} ${FRAME}·${RESET} ${BRIGHT}${formatTokens(current)}/${formatTokens(window)}${RESET}`,
    Number.isFinite(used) ? compactBar(used, barWidth, usedColor) : `${FRAME}${'─'.repeat(barWidth)}${RESET}`,
    `${LABEL}CACHE${RESET} ${CYAN}${formatTokens(cached)}${cachePct == null ? '' : ` ${cachePct}%`}${RESET}`,
    `${LABEL}LEFT${RESET} ${BRIGHT}${Number.isFinite(used) ? `${100 - used}%` : '--'}${RESET} ${FRAME}·${RESET} ${LABEL}CMP${RESET} ${PURPLE}${state?.meta?.compactCount ?? 0}${RESET}`
  ];
}

function usageColumn(state, nowMs, runtime, width) {
  const total = state?.usage?.total;
  const last = state?.usage?.last;

  if (runtime?.profile?.auth === 'api') {
    return [
      `${LABEL}IN${RESET} ${BRIGHT}${formatTokens(total?.inputTokens)}${RESET} ${FRAME}·${RESET} ${LABEL}OUT${RESET} ${BLUE}${formatTokens(total?.outputTokens)}${RESET}`,
      `${LABEL}RSN${RESET} ${PURPLE}${formatTokens(total?.reasoningOutputTokens)}${RESET}`,
      `${LABEL}TURN${RESET} ${GOLD}${formatTokens(last?.inputTokens)} in / ${formatTokens(last?.outputTokens)} out${RESET}`,
      `${LABEL}quota${RESET} ${MUTED}n/a${RESET}`
    ];
  }

  const barWidth = width >= 42 ? 9 : 6;
  return [
    quotaText('5h', state?.fiveHour, nowMs, barWidth),
    quotaText('Week', state?.weekly, nowMs, barWidth),
    `${LABEL}IN${RESET} ${BRIGHT}${formatTokens(total?.inputTokens)}${RESET} ${FRAME}·${RESET} ${LABEL}OUT${RESET} ${BLUE}${formatTokens(total?.outputTokens)}${RESET}`,
    `${LABEL}RSN${RESET} ${PURPLE}${formatTokens(total?.reasoningOutputTokens)}${RESET} ${FRAME}·${RESET} ${LABEL}TURN${RESET} ${GOLD}${formatTokens(last?.inputTokens)} in / ${formatTokens(last?.outputTokens)} out${RESET}`
  ];
}

function sessionColumn(state, runtime, nowMs) {
  const thread = state?.meta?.threadId ? String(state.meta.threadId).slice(0, 12) : '--';
  const version = state?.meta?.cliVersion || '--';
  const binding = state?.meta?.currentSession === false ? 'waiting current rollout' : 'current rollout';
  return [
    `${LABEL}elapsed${RESET} ${BRIGHT}${formatDuration(nowMs - (runtime?.startedAtMs ?? nowMs))}${RESET} ${FRAME}·${RESET} ${LABEL}turns${RESET} ${BRIGHT}${state?.meta?.currentSession === false ? '--' : state?.meta?.turnCount ?? 0}${RESET}`,
    `${LABEL}last${RESET} ${GOLD}${formatLatency(state?.meta?.lastTurnDurationMs)}${RESET} ${FRAME}·${RESET} ${LABEL}update${RESET} ${MUTED}${formatAge(state?.meta?.lastEventAtMs, nowMs)}${RESET}`,
    `${LABEL}thread${RESET} ${CYAN}${thread}${RESET} ${FRAME}·${RESET} ${LABEL}codex${RESET} ${MUTED}${version}${RESET}`,
    `${LABEL}data${RESET} ${state?.meta?.currentSession === false ? ORANGE : GREEN}${binding}${RESET}`
  ];
}

function activityColumn(state) {
  const info = activityInfo(state);
  const activeTools = (state?.meta?.activeToolIds?.length ?? 0) + (state?.meta?.anonymousToolDepth ?? 0);
  const source = state?.meta?.activitySource || 'rollout';
  const detail = state?.meta?.activityDetail || info.description;
  const tool = state?.meta?.lastToolName || '--';
  const approval = String(Boolean(state?.meta?.approvalPending || info.label === 'APPROVAL')).toLowerCase();
  const error = String(Boolean(state?.meta?.errorActive || info.label === 'ERROR')).toLowerCase();

  return [
    `${info.color}${BOLD}${info.symbol} ${info.label}${RESET} ${MUTED}${info.description}${RESET}`,
    `${LABEL}source${RESET} ${BRIGHT}${source}${RESET} ${FRAME}·${RESET} ${LABEL}detail${RESET} ${MUTED}${detail}${RESET}`,
    `${LABEL}tools${RESET} ${BLUE}${activeTools}${RESET} ${FRAME}·${RESET} ${LABEL}last${RESET} ${CYAN}${tool}${RESET}`,
    `${LABEL}approval${RESET} ${approval === 'true' ? ORANGE : MUTED}${approval}${RESET} ${FRAME}·${RESET} ${LABEL}retry${RESET} ${ORANGE}${state?.meta?.retryCount ?? 0}${RESET} ${FRAME}·${RESET} ${LABEL}err${RESET} ${error === 'true' ? RED : MUTED}${state?.meta?.errorCount ?? 0}${RESET}`
  ];
}

export function monitorRowsForCols(cols) {
  return cols >= FULL_MIN_COLS ? 9 : liteRowsForCols(cols);
}

export function renderMonitor(state, cols = 120, nowMs = Date.now(), runtime = {}) {
  if (cols < FULL_MIN_COLS) return renderLite(state, cols, nowMs, runtime);

  const widths = columnWidths(cols);
  const authTitle = runtime?.profile?.auth === 'api' ? 'USAGE · API' : 'USAGE · LOGIN';
  const titles = [
    `${CYAN}${BOLD}CONTEXT${RESET}`,
    `${PURPLE}${BOLD}${authTitle}${RESET}`,
    `${GREEN}${BOLD}SESSION${RESET}`,
    `${GOLD}${BOLD}CURRENT ACTIVITY${RESET}`
  ];

  const columns = [
    contextColumn(state, widths[0]),
    usageColumn(state, nowMs, runtime, widths[1]),
    sessionColumn(state, runtime, nowMs),
    activityColumn(state)
  ];

  const lines = [
    topBorder(cols),
    summaryRow(state, runtime, cols, nowMs),
    horizontalBorder('├', '┬', '┤', widths),
    tableRow(titles, widths)
  ];

  for (let row = 0; row < 4; row += 1) {
    lines.push(tableRow(columns.map((column) => column[row] ?? ''), widths));
  }

  lines.push(horizontalBorder('╰', '┴', '╯', widths));
  return lines.map((line) => truncateAnsi(line, cols));
}
