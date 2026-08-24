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

export function colorForRemaining(remaining) {
  if (remaining > 60) return GREEN;
  if (remaining >= 20) return ORANGE;
  return RED;
}

export function formatCountdown(resetEpoch, nowMs = Date.now()) {
  if (!Number.isFinite(resetEpoch)) return '--';
  const seconds = Math.max(0, Math.ceil(resetEpoch - nowMs / 1000));
  if (seconds <= 0) return 'now';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d${String(hours).padStart(2, '0')}h`;
  if (hours > 0) return `${hours}h${String(mins).padStart(2, '0')}m`;
  return `${minutes}m`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h${String(mins % 60).padStart(2, '0')}m`;
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

export function formatTokens(value) {
  if (!Number.isFinite(value)) return '--';
  const n = Math.max(0, value);
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.0+$/, '')}M`;
  }
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

function plain(text) { return String(text).replace(ANSI_RE, ''); }
function plainLength(text) { return plain(text).length; }

export function truncateAnsi(text, maxColumns) {
  if (maxColumns <= 0) return '';
  const source = String(text);
  if (plainLength(source) <= maxColumns) return source;

  const keepColumns = Math.max(0, maxColumns - 1);
  let visible = 0;
  let out = '';
  let i = 0;

  while (i < source.length && visible < keepColumns) {
    if (source[i] === '\x1b' && source[i + 1] === '[') {
      const match = source.slice(i).match(/^\x1b\[[0-9;?]*[ -/]*[@-~]/);
      if (match) {
        out += match[0];
        i += match[0].length;
        continue;
      }
    }

    const cp = source.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    out += ch;
    visible += 1;
    i += ch.length;
  }

  return `${out}${RESET}…`;
}

function padAnsi(text, width) {
  const len = plainLength(text);
  return len >= width ? truncateAnsi(text, width) : text + ' '.repeat(width - len);
}

function quotaBar(remainingPercent, segments) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(remainingPercent) ? remainingPercent : 0));
  const filled = Math.max(0, Math.min(segments, Math.round((pct / 100) * segments)));
  const color = colorForRemaining(pct);
  return `${color}${'━'.repeat(filled)}${RESET}${FRAME}${'─'.repeat(segments - filled)}${RESET}`;
}

function contextBar(usedPercent, segments) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(usedPercent) ? usedPercent : 0));
  const filled = Math.max(0, Math.min(segments, Math.round((pct / 100) * segments)));
  const usedColor = pct >= 80 ? RED : ORANGE;
  return `${usedColor}${'━'.repeat(filled)}${RESET}${FRAME}${'─'.repeat(segments - filled)}${RESET}`;
}

function metric(label, text, color = BRIGHT) {
  return `${LABEL}${label}${RESET} ${color}${text}${RESET}`;
}

function separator() {
  return ` ${FRAME}·${RESET} `;
}

function authProfileBadge(runtime) {
  const auth = runtime?.profile?.auth;
  if (!auth) return null;
  const text = auth === 'api' ? 'API' : 'LOGIN';
  const color = auth === 'api' ? PURPLE : CYAN;
  return `${LABEL}AUTH${RESET} ${color}${BOLD}${text}${RESET}`;
}

function contextPercent(state) {
  const contextWindow = state?.usage?.contextWindow;
  const lastTotal = state?.usage?.last?.totalTokens;
  if (!Number.isFinite(contextWindow) || contextWindow <= 12_000) return null;
  if (!Number.isFinite(lastTotal)) return 0;
  const effective = contextWindow - 12_000;
  const used = Math.max(0, lastTotal - 12_000);
  return Math.max(0, Math.min(100, Math.round((used / effective) * 100)));
}

function contextUsedColor(usedPercent) {
  if (!Number.isFinite(usedPercent)) return MUTED;
  return usedPercent >= 80 ? RED : ORANGE;
}

function projectName(runtime, state) {
  return runtime?.project || state?.meta?.cwd?.split(/[\\/]/).filter(Boolean).at(-1) || 'workspace';
}

function modelName(state, runtime) {
  return runtime?.observedModel || state?.meta?.model || 'Codex';
}

function reasoningName(state, runtime) {
  return runtime?.observedReasoning || state?.meta?.reasoningEffort || 'default';
}

function activityInfo(state) {
  const activity = String(state?.meta?.activityState || 'IDLE').toUpperCase();
  switch (activity) {
    case 'THINKING': return { symbol: '●', label: 'THINKING', short: 'THINK', description: 'reasoning', color: GOLD };
    case 'TOOL': return { symbol: '◆', label: 'TOOL', short: 'TOOL', description: 'running tool', color: BLUE };
    case 'APPROVAL': return { symbol: '!', label: 'APPROVAL', short: 'APPR', description: 'waiting for approval', color: ORANGE };
    case 'ERROR': return { symbol: '×', label: 'ERROR', short: 'ERR', description: 'failed', color: RED };
    default: return { symbol: '●', label: 'IDLE', short: 'IDLE', description: 'waiting for input', color: GREEN };
  }
}

function activityBadge(state, verbose = false) {
  const info = activityInfo(state);
  const detail = verbose ? ` ${MUTED}${info.description}${RESET}` : '';
  return `${info.color}${info.symbol}${RESET} ${info.color}${BOLD}${info.label}${RESET}${detail}`;
}

function legendEntry(label, description, color, symbol, active) {
  if (active) {
    return `${color}${BOLD}${symbol} ${label}${RESET} ${BRIGHT}${description}${RESET}`;
  }
  return `${LABEL}${label}${RESET} ${FRAME}${description}${RESET}`;
}

function stateLegendRows(state) {
  const active = activityInfo(state).short;
  const entry = (label, description, color, symbol) =>
    legendEntry(label, description, color, symbol, active === label);

  return [
    `${LABEL}STATE${RESET} ${entry('IDLE', 'waiting', GREEN, '●')}${separator()}${entry('THINK', 'reasoning', GOLD, '●')}${separator()}${entry('TOOL', 'running', BLUE, '◆')}`,
    `${LABEL}     ${RESET}${entry('APPR', 'approval', ORANGE, '!')}${separator()}${entry('ERR', 'failed', RED, '×')}`
  ];
}

function composeLeftRight(left, right, width, minGap = 4) {
  if (!right) return truncateAnsi(left, width);
  const rightWidth = plainLength(right);
  if (rightWidth >= width) return truncateAnsi(right, width);

  const leftWidth = Math.max(0, width - rightWidth - minGap);
  const clippedLeft = truncateAnsi(left, leftWidth);
  const gap = Math.max(minGap, width - plainLength(clippedLeft) - rightWidth);
  return `${clippedLeft}${' '.repeat(gap)}${right}`;
}

function renderTopBorder(cols, runtime = {}) {
  const title = runtime?.profile?.ui === 'lite' ? ' CODEX MONITOR · LITE ' : ' CODEX MONITOR ';
  const prefix = '╭─';
  const suffix = '╮';
  const fill = Math.max(0, cols - prefix.length - title.length - suffix.length);
  return `${FRAME}${prefix}${RESET}${BLUE}${BOLD}${title}${RESET}${FRAME}${'─'.repeat(fill)}${suffix}${RESET}`;
}

function renderBottomBorder(cols) {
  return `${FRAME}╰${'─'.repeat(Math.max(0, cols - 2))}╯${RESET}`;
}

function boxed(content, cols) {
  const inner = Math.max(0, cols - 4);
  return `${FRAME}│${RESET} ${padAnsi(content, inner)} ${FRAME}│${RESET}`;
}

function renderHeader(state, runtime, cols, nowMs) {
  const items = [
    `${GOLD}${BOLD}${modelName(state, runtime)}${RESET}`,
    `${PURPLE}${reasoningName(state, runtime)}${RESET}`,
    `${CYAN}${projectName(runtime, state)}${RESET}`
  ];

  if (runtime?.branch) {
    const dirty = Number.isFinite(runtime?.dirtyCount) && runtime.dirtyCount > 0
      ? ` ${ORANGE}+${runtime.dirtyCount}${RESET}`
      : '';
    items.push(`${GREEN}${runtime.branch}${RESET}${dirty}`);
  }

  const authBadge = authProfileBadge(runtime);
  if (authBadge) items.push(authBadge);
  items.push(activityBadge(state, cols >= 120));
  items.push(metric('SESSION', formatDuration(nowMs - (runtime?.startedAtMs ?? nowMs)), BRIGHT));
  const turn = state?.meta?.currentSession === false ? '--' : String(state?.meta?.turnCount ?? 0);
  items.push(metric('TURN', turn, BRIGHT));
  items.push(metric('DUR', formatLatency(state?.meta?.lastTurnDurationMs), GOLD));
  items.push(metric('UPD', formatAge(state?.meta?.lastEventAtMs, nowMs), MUTED));

  if ((state?.meta?.compactCount ?? 0) > 0) items.push(metric('CMP', String(state.meta.compactCount), PURPLE));
  if ((state?.meta?.retryCount ?? 0) > 0) items.push(metric('RETRY', String(state.meta.retryCount), ORANGE));
  if ((state?.meta?.errorCount ?? 0) > 0) items.push(metric('ERR', String(state.meta.errorCount), RED));
  if (cols >= 175 && state?.meta?.cliVersion) items.push(`${LABEL}v${RESET}${MUTED}${state.meta.cliVersion}${RESET}`);

  return truncateAnsi(items.join(separator()), Math.max(0, cols - 4));
}

function waitingQuota(label) {
  return `${BOLD}${label}${RESET} ${MUTED}waiting…${RESET}`;
}

function renderQuotaBlock(label, window, width, nowMs) {
  if (!window) return waitingQuota(label);
  const remaining = Math.round(window.remainingPercent);
  const color = colorForRemaining(remaining);
  const resetText = formatCountdown(window.resetsAt, nowMs);
  const fixed = plainLength(`${label}  100% left  ↻ ${resetText}`) + 2;
  const segments = Math.max(8, Math.min(30, width - fixed));
  return `${BOLD}${label}${RESET} ${quotaBar(remaining, segments)} ${color}${BOLD}${String(remaining).padStart(3)}%${RESET} ${MUTED}left${RESET} ${FRAME}↻${RESET} ${MUTED}${resetText}${RESET}`;
}

function renderQuotaRow(state, runtime, cols, nowMs) {
  const inner = Math.max(20, cols - 4);
  if (runtime?.profile?.auth === 'api') {
    return truncateAnsi(`${PURPLE}${BOLD}API KEY${RESET} ${FRAME}·${RESET} ${MUTED}subscription quota not applicable${RESET}`, inner);
  }
  const blockWidth = inner >= 150 ? 56 : inner >= 120 ? 48 : inner >= 90 ? 40 : 34;
  const five = renderQuotaBlock('5h', state?.fiveHour, blockWidth, nowMs);
  const week = renderQuotaBlock('Week', state?.weekly, blockWidth, nowMs);
  return truncateAnsi(`${five}${separator()}${week}`, inner);
}

function renderContextMetric(state, cols) {
  const ctxWindow = state?.usage?.contextWindow;
  const ctxTokens = state?.usage?.last?.totalTokens;
  const used = contextPercent(state);
  if (!Number.isFinite(ctxWindow)) return metric('CTX', '--', MUTED);

  const usedColor = contextUsedColor(used);
  const barSegments = cols >= 165 ? 18 : cols >= 130 ? 14 : cols >= 105 ? 10 : cols >= 90 ? 7 : 0;
  const bar = barSegments > 0 && Number.isFinite(used) ? ` ${contextBar(used, barSegments)}` : '';
  const pct = Number.isFinite(used) ? ` ${usedColor}${BOLD}${used}% used${RESET}` : '';
  return `${LABEL}CTX${RESET}${bar} ${BRIGHT}${formatTokens(ctxTokens ?? 0)}/${formatTokens(ctxWindow)}${RESET}${pct}`;
}

function renderLastTurnUsage(state) {
  const last = state?.usage?.last;
  if (!last) return metric('TURN IO', '-- in · -- out', MUTED);
  return `${LABEL}TURN IO${RESET} ${GOLD}${BOLD}${formatTokens(last.inputTokens)}${RESET} ${MUTED}in${RESET} ${FRAME}·${RESET} ${BLUE}${BOLD}${formatTokens(last.outputTokens)}${RESET} ${MUTED}out${RESET}`;
}

function renderTokenRow(state, cols) {
  const total = state?.usage?.total;
  const input = total?.inputTokens;
  const cached = total?.cachedInputTokens;
  const output = total?.outputTokens;
  const reasoning = total?.reasoningOutputTokens;
  const cachePct = Number.isFinite(input) && input > 0 && Number.isFinite(cached)
    ? Math.max(0, Math.min(100, Math.round((cached / input) * 100)))
    : null;

  const fields = [
    metric('IN', formatTokens(input), BRIGHT),
    metric('CACHE', `${formatTokens(cached)}${cachePct == null ? '' : ` ${cachePct}%`}`, CYAN),
    metric('OUT', formatTokens(output), BLUE),
    metric('RSN', formatTokens(reasoning), PURPLE),
    renderLastTurnUsage(state),
    renderContextMetric(state, cols)
  ];
  return truncateAnsi(fields.join(separator()), Math.max(0, cols - 4));
}

export function monitorRowsForCols(cols) {
  return cols >= 72 ? 5 : 4;
}

function renderNarrow(state, runtime, cols, nowMs) {
  const metaItems = [
    `${GOLD}${BOLD}${modelName(state, runtime)}${RESET}`,
    `${PURPLE}${reasoningName(state, runtime)}${RESET}`
  ];
  const authBadge = authProfileBadge(runtime);
  if (authBadge) metaItems.push(authBadge);
  metaItems.push(activityBadge(state));
  const meta = truncateAnsi(metaItems.join(separator()), cols);
  const apiMode = runtime?.profile?.auth === 'api';
  const five = apiMode
    ? `${PURPLE}${BOLD}API KEY${RESET} ${FRAME}·${RESET} ${MUTED}token/context usage from current session${RESET}`
    : renderQuotaBlock('5h', state?.fiveHour, cols, nowMs);
  const week = apiMode
    ? `${LABEL}LIMITS${RESET} ${MUTED}provider-specific rate limits are not tracked${RESET}`
    : renderQuotaBlock('Week', state?.weekly, cols, nowMs);
  const total = state?.usage?.total;
  const last = state?.usage?.last;
  const tokens = `${LABEL}IN${RESET} ${BRIGHT}${formatTokens(total?.inputTokens)}${RESET} ${FRAME}·${RESET} ${LABEL}OUT${RESET} ${BLUE}${formatTokens(total?.outputTokens)}${RESET} ${FRAME}·${RESET} ${LABEL}RSN${RESET} ${PURPLE}${formatTokens(total?.reasoningOutputTokens)}${RESET} ${FRAME}·${RESET} ${LABEL}TURN IO${RESET} ${GOLD}${formatTokens(last?.inputTokens)}${RESET} ${MUTED}in${RESET} ${FRAME}·${RESET} ${BLUE}${formatTokens(last?.outputTokens)}${RESET} ${MUTED}out${RESET}`;
  return [meta, five, week, tokens].map((line) => truncateAnsi(line, cols));
}

export function renderMonitor(state, cols = 80, nowMs = Date.now(), runtime = {}) {
  if (cols < 72) return renderNarrow(state, runtime, cols, nowMs);

  const inner = Math.max(20, cols - 4);
  let quotaRow = renderQuotaRow(state, runtime, cols, nowMs);
  let tokenRow = renderTokenRow(state, cols);

  // On wide terminals, keep the state guide in a dedicated right-side corner.
  // Only the active state is bright; the rest stays dim so the guide teaches
  // without competing with quota/token data.
  if (cols >= 150) {
    const [guideTop, guideBottom] = stateLegendRows(state);
    const guideWidth = Math.max(plainLength(guideTop), plainLength(guideBottom));
    const gap = 5;
    const leftInner = inner - guideWidth - gap;

    // Require enough room for useful quota/token content before showing guide.
    if (leftInner >= 72) {
      quotaRow = composeLeftRight(
        renderQuotaRow(state, runtime, leftInner + 4, nowMs),
        guideTop,
        inner,
        gap
      );
      tokenRow = composeLeftRight(
        renderTokenRow(state, leftInner + 4),
        guideBottom,
        inner,
        gap
      );
    }
  }

  return [
    renderTopBorder(cols, runtime),
    boxed(renderHeader(state, runtime, cols, nowMs), cols),
    boxed(quotaRow, cols),
    boxed(tokenRow, cols),
    renderBottomBorder(cols)
  ].map((line) => truncateAnsi(line, cols));
}
