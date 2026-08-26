import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from '../history/theme.js';
import { filterSessionTimeline, MANAGER_TIMELINE_FILTERS } from './timeline.js';
import {
  contextChartModel,
  cumulativeTokenChartModel,
  tokenIoByTurnChartModel,
  toolCallsByTurnChartModel,
  toolShareChartModel,
  turnDurationChartModel
} from './analytics-charts.js';

export const MANAGER_INSPECT_TABS = Object.freeze(['info', 'timeline', 'tokens', 'turns', 'tools', 'resources', 'errors']);

function finiteOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function two(value) {
  return String(value).padStart(2, '0');
}

function fmtNum(value) {
  const n = finiteOrNull(value);
  if (n == null) return '--';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtBytes(value) {
  const n = finiteOrNull(value);
  if (n == null) return '--';
  if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(1)}M`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${Math.round(n)}B`;
}

function fmtDate(ms) {
  const n = finiteOrNull(ms);
  if (n == null) return '--';
  try {
    const date = new Date(n);
    return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  } catch {
    return '--';
  }
}

function fmtTime(ms) {
  const n = finiteOrNull(ms);
  if (n == null) return '--:--:--';
  try {
    const date = new Date(n);
    return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  } catch {
    return '--:--:--';
  }
}

function fmtDuration(ms) {
  const n = finiteOrNull(ms);
  if (n == null || n < 0) return '--';
  if (n < 1000) return `${Math.round(n)}ms`;
  const seconds = Math.floor(n / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function fmtPercentValue(value) {
  const n = finiteOrNull(value);
  return n == null ? '--' : `${Math.round(n)}%`;
}

function fmtPercent(used, window) {
  const a = finiteOrNull(used);
  const b = finiteOrNull(window);
  if (a == null || b == null || b <= 0) return '--';
  return `${Math.round(Math.max(0, Math.min(100, (a / b) * 100)))}%`;
}

function border(width, title, mode, active = false) {
  const label = title ? ` ${title} ` : '';
  const left = active ? '╔' : '┌';
  const right = active ? '╗' : '┐';
  const dash = active ? '═' : '─';
  const labelText = truncateCells(label, Math.max(0, width - 2), '');
  return hpaint(`${left}${labelText}${dash.repeat(Math.max(0, width - cellWidth(labelText) - 2))}${right}`, active ? 'nav' : 'panel', mode);
}

function panel(content, width, height, { title = '', mode = '256', active = false } = {}) {
  const inner = Math.max(1, width - 2);
  const lines = [border(width, title, mode, active)];
  for (let index = 0; index < Math.max(0, height - 2); index += 1) {
    const text = truncateCells(content[index] ?? '', inner, '');
    const edge = hpaint(active ? '║' : '│', active ? 'nav' : 'panel', mode);
    lines.push(`${edge}${padCells(text, inner)}${edge}`);
  }
  lines.push(hpaint(`${active ? '╚' : '└'}${(active ? '═' : '─').repeat(inner)}${active ? '╝' : '┘'}`, active ? 'nav' : 'panel', mode));
  return lines.slice(0, height);
}

function join(left, right, leftWidth, height) {
  const lines = [];
  for (let index = 0; index < height; index += 1) lines.push(`${left[index] ?? ''.padEnd(leftWidth)} ${right[index] ?? ''}`);
  return lines;
}

function paintRows(rows, token, mode) {
  return (Array.isArray(rows) ? rows : []).map((row) => hpaint(row, token, mode));
}

function timeAxis(firstAtMs, lastAtMs, width) {
  if (finiteOrNull(firstAtMs) == null || finiteOrNull(lastAtMs) == null) return '';
  const left = fmtTime(firstAtMs);
  const right = fmtTime(lastAtMs);
  const gap = Math.max(1, width - left.length - right.length);
  return `${left}${'─'.repeat(gap)}${right}`;
}

function infoLines(detail) {
  return [
    `Project      ${detail.info?.project ?? 'UNKNOWN'}`,
    `Thread       ${detail.info?.threadId ?? '--'}`,
    `Model        ${detail.info?.model ?? '--'}`,
    `Reasoning    ${detail.info?.reasoning ?? '--'}`,
    `Started      ${fmtDate(detail.info?.startedAtMs)}`,
    `Last event   ${fmtDate(detail.info?.lastEventAtMs)}`,
    `Duration     ${fmtDuration(detail.info?.durationMs)}`,
    `CWD          ${detail.info?.cwd ?? '--'}`
  ];
}

function telemetryLines(detail) {
  return [
    `Context      ${fmtPercent(detail.tokens?.contextUsed, detail.tokens?.contextWindow)}   ${fmtNum(detail.tokens?.contextUsed)} / ${fmtNum(detail.tokens?.contextWindow)}`,
    `Input        ${fmtNum(detail.tokens?.input)}`,
    `Cache        ${fmtNum(detail.tokens?.cached)}`,
    `Output       ${fmtNum(detail.tokens?.output)}`,
    `Reasoning    ${fmtNum(detail.tokens?.reasoning)}`,
    `Turns        ${fmtNum(detail.turns?.count)}   completed ${fmtNum(detail.turns?.completed)}`,
    `Tools        ${fmtNum(detail.tools?.count)}`,
    `Errors       ${Array.isArray(detail.errors) ? detail.errors.length : 0}`,
    `File         ${fmtBytes(detail.info?.fileSizeBytes)}   parsed ${fmtNum(detail.info?.parsedLines)} lines`
  ];
}

function contextAnalyticsLines(detail, width, mode) {
  const analytics = detail.analytics;
  if (!analytics) return telemetryLines(detail);
  const chartWidth = Math.max(12, width - 2);
  const chart = contextChartModel(analytics, chartWidth, { ascii: mode === 'mono' && width < 60, height: width >= 60 ? 4 : 3 });
  return [
    `${hpaint('CONTEXT STREAM', 'heading', mode)}  current ${hpaint(fmtPercentValue(chart.currentPercent), 'pressure', mode)}  peak ${hpaint(fmtPercentValue(chart.peakPercent), 'pressure', mode)}  compactions ${chart.compactions}`,
    ...paintRows(chart.rows, 'pressure', mode),
    hpaint(timeAxis(chart.firstAtMs, chart.lastAtMs, chartWidth), 'dim', mode),
    '',
    ...telemetryLines(detail)
  ];
}

function tokenSummaryLines(detail, width, mode) {
  const analytics = detail.analytics;
  if (!analytics) return telemetryLines(detail).slice(0, 5);
  const chartWidth = Math.max(12, width - 2);
  const cumulative = cumulativeTokenChartModel(analytics, chartWidth, { ascii: mode === 'mono' && width < 60, height: 3 });
  return [
    `${hpaint('CUMULATIVE TOKENS', 'heading', mode)}  total ${hpaint(fmtNum(cumulative.total), 'secondary', mode)}`,
    ...paintRows(cumulative.rows, 'secondary', mode),
    hpaint(timeAxis(cumulative.firstAtMs, cumulative.lastAtMs, chartWidth), 'dim', mode),
    '',
    `Input        ${fmtNum(cumulative.input)}`,
    `Cached       ${fmtNum(cumulative.cached)}`,
    `Uncached     ${fmtNum(cumulative.uncachedInput)}`,
    `Output       ${fmtNum(cumulative.output)}`,
    `Reasoning    ${fmtNum(cumulative.reasoning)}`,
    `Total I/O    ${fmtNum(cumulative.total)}`,
    `Context      ${fmtPercent(detail.tokens?.contextUsed, detail.tokens?.contextWindow)}   peak ${fmtPercentValue(analytics.context?.peakPercent)}`
  ];
}

function tokenTurnLines(detail, width, mode, maxRows = 14) {
  const analytics = detail.analytics;
  if (!analytics) return [];
  const chartWidth = Math.max(12, width - 2);
  const perTurn = tokenIoByTurnChartModel(analytics, chartWidth, { ascii: mode === 'mono' && width < 60, height: 3 });
  const turns = Array.isArray(analytics.turns?.items) ? analytics.turns.items : [];
  const lines = [
    `${hpaint('TOKEN I/O / TURN', 'heading', mode)}  peak ${fmtNum(perTurn.peakTokens)}`,
    ...paintRows(perTurn.rows, 'session', mode),
    '',
    hpaint(' #    INPUT    CACHE   UNCACHED   OUTPUT   REASON    TOTAL', 'label', mode)
  ];
  for (const turn of turns.slice(-Math.max(3, maxRows))) {
    lines.push(`${String(turn.index + 1).padStart(3)}  ${String(fmtNum(turn.inputTokens)).padStart(7)}  ${String(fmtNum(turn.cachedTokens)).padStart(7)}  ${String(fmtNum(turn.uncachedInputTokens)).padStart(9)}  ${String(fmtNum(turn.outputTokens)).padStart(7)}  ${String(fmtNum(turn.reasoningTokens)).padStart(7)}  ${String(fmtNum(turn.totalTokens)).padStart(7)}`);
  }
  if (!turns.length) lines.push(hpaint('No per-turn token evidence.', 'dim', mode));
  return lines;
}

function tokenAnalyticsLines(detail, width, mode) {
  return [...tokenSummaryLines(detail, width, mode), '', ...tokenTurnLines(detail, width, mode, 8)];
}

function turnChartLines(detail, width, mode) {
  const analytics = detail.analytics;
  if (!analytics) return [
    `Turns        ${fmtNum(detail.turns?.count)}`,
    `Completed    ${fmtNum(detail.turns?.completed)}`,
    `Last turn    ${fmtDuration(detail.turns?.lastDurationMs)}`
  ];
  const chart = turnDurationChartModel(analytics, Math.max(12, width - 2), { ascii: mode === 'mono' && width < 60, height: 4 });
  return [
    `${hpaint('TURN DURATION', 'heading', mode)}  completed ${fmtNum(analytics.turns?.completed)}  peak ${fmtDuration(chart.maxDurationMs)}`,
    ...paintRows(chart.rows, 'pressure', mode),
    '',
    `Turns        ${fmtNum(detail.turns?.count)}`,
    `Completed    ${fmtNum(detail.turns?.completed)}`,
    `Last turn    ${fmtDuration(detail.turns?.lastDurationMs)}`
  ];
}

function turnTableOnlyLines(detail, mode, maxRows = 20) {
  const analytics = detail.analytics;
  if (!analytics) return [];
  const turns = Array.isArray(analytics.turns?.items) ? analytics.turns.items : [];
  const lines = [hpaint(' #   START     DURATION   INPUT    OUTPUT   REASON   CTX    TOOLS', 'label', mode)];
  const visible = Math.max(3, Math.min(maxRows, turns.length));
  for (const turn of turns.slice(-visible)) {
    const ctx = fmtPercent(turn.contextUsed, turn.contextWindow);
    const marker = turn.completed ? ' ' : turn.incomplete ? '!' : '>';
    lines.push(`${marker}${String(turn.index + 1).padStart(3)}  ${fmtTime(turn.startedAtMs)}  ${String(fmtDuration(turn.durationMs)).padEnd(9)}  ${String(fmtNum(turn.inputTokens)).padStart(7)}  ${String(fmtNum(turn.outputTokens)).padStart(7)}  ${String(fmtNum(turn.reasoningTokens)).padStart(7)}  ${String(ctx).padStart(5)}  ${String(fmtNum(turn.toolCount)).padStart(5)}`);
  }
  if (!turns.length) lines.push(hpaint('No turn-level analytics evidence.', 'dim', mode));
  return lines;
}

function turnTableLines(detail, width, mode) {
  return [...turnChartLines(detail, width, mode), '', ...turnTableOnlyLines(detail, mode, 14)];
}

function toolSummaryLines(detail, width, mode) {
  const analytics = detail.analytics;
  if (!analytics) {
    const tools = Array.isArray(detail.tools?.byName) ? detail.tools.byName : [];
    return [`Total tools  ${fmtNum(detail.tools?.count)}`, '', ...tools.slice(0, 12).map((item) => `${String(fmtNum(item.count)).padStart(6)}  ${item.name ?? '--'}`)];
  }
  const bars = toolShareChartModel(analytics, Math.max(8, Math.min(30, Math.floor(width * 0.55))), { ascii: mode === 'mono' && width < 60, maxItems: 8 });
  const callsByTurn = toolCallsByTurnChartModel(analytics, Math.max(12, width - 2), { ascii: mode === 'mono' && width < 60, height: 3 });
  const lines = [
    `${hpaint('TOOL CALLS / TURN', 'heading', mode)}  total ${fmtNum(bars.total)}  peak ${fmtNum(callsByTurn.peakCalls)}`,
    ...paintRows(callsByTurn.rows, 'live', mode),
    '',
    hpaint('TOOL SHARE', 'heading', mode)
  ];
  for (const row of bars.bars) lines.push(`${String(row.label).padEnd(16).slice(0, 16)} ${row.bar} ${fmtNum(row.value)}`);
  if (!bars.bars.length) lines.push(hpaint('No tool call evidence.', 'dim', mode));
  return lines;
}

function toolEventLines(detail, maxRows = 18) {
  const analytics = detail.analytics;
  const events = Array.isArray(analytics?.tools?.events) ? analytics.tools.events : [];
  const lines = [];
  for (const event of events.slice(-Math.max(4, maxRows)).reverse()) {
    lines.push(`${fmtTime(event.atMs)}  ${String(event.name ?? '--').padEnd(16).slice(0, 16)}  ${String(fmtDuration(event.durationMs)).padStart(7)}${event.failed ? '  FAILED' : ''}`);
  }
  if (!events.length) lines.push('No recent tool events.');
  return lines;
}

function toolAnalyticsLines(detail, width, mode) {
  return [...toolSummaryLines(detail, width, mode), '', hpaint('RECENT TOOL EVENTS', 'label', mode), ...toolEventLines(detail, 8)];
}

function errorAnalyticsLines(detail, mode) {
  const signals = Array.isArray(detail.analytics?.signals) ? detail.analytics.signals : [];
  const errors = Array.isArray(detail.errors) ? detail.errors : [];
  if (!signals.length && !errors.length) return ['No recorded errors/retries/compactions in selected session.'];
  const lines = [];
  if (signals.length) {
    lines.push(hpaint('ERROR / RETRY / COMPACTION STREAM', 'heading', mode));
    for (const signal of signals.slice(-16).reverse()) {
      const token = signal.kind === 'error' || signal.kind === 'turn-error' || signal.kind === 'tool-failure' ? 'error' : signal.kind === 'retry' ? 'pressure' : 'dim';
      lines.push(`${fmtTime(signal.atMs)}  ${hpaint(String(signal.kind ?? 'event').toUpperCase().padEnd(12).slice(0, 12), token, mode)}  ${signal.detail ?? '--'}`);
    }
  } else {
    for (const item of errors.slice(-14).reverse()) lines.push(`${fmtTime(item.atMs)}  ${item.detail ?? '--'}`);
  }
  return lines;
}

function tabLines(detail, tab, width, mode) {
  if (tab === 'tokens') return tokenAnalyticsLines(detail, width, mode);
  if (tab === 'turns') return turnTableLines(detail, width, mode);
  if (tab === 'tools') return toolAnalyticsLines(detail, width, mode);
  if (tab === 'resources') {
    const evidence = Array.isArray(detail.resources?.evidence) ? detail.resources.evidence : [];
    return evidence.length
      ? evidence.slice(0, 20).map((item) => `${fmtTime(item.atMs)}  ${item.kind ?? '--'}  ${item.value ?? '--'}`)
      : ['No historical resource evidence.', '', 'Resources are evidence-based; current filesystem state is not inferred.'];
  }
  if (tab === 'errors') return errorAnalyticsLines(detail, mode);
  return infoLines(detail);
}

function tabsLine(activeTab, mode) {
  return MANAGER_INSPECT_TABS.map((tab) => {
    const label = `${tab[0].toUpperCase()}${tab.slice(1)}`;
    return tab === activeTab ? hpaint(`[${label}]`, 'nav', mode) : label;
  }).join('  ');
}

function eventToken(event) {
  if (event?.failed || event?.category === 'error') return 'error';
  if (event?.category === 'result') return 'live';
  if (event?.category === 'agent') return 'pressure';
  if (event?.category === 'shell') return 'secondary';
  if (event?.category === 'file') return 'nav';
  if (event?.category === 'approval' || event?.category === 'retry' || event?.category === 'turn') return 'pressure';
  if (event?.category === 'user') return 'session';
  if (event?.category === 'assistant') return 'text';
  if (event?.category === 'compaction') return 'dim';
  return 'label';
}

function eventCategory(event) {
  const raw = String(event?.category ?? 'event').toUpperCase();
  return raw.length > 9 ? raw.slice(0, 9) : raw;
}

function timelineView(detail, { filter = 'all', search = '', selectedIndex = 0, rows = 12, mode = '256' } = {}) {
  const events = filterSessionTimeline(detail?.timeline, { filter, search });
  const resolved = events.length ? Math.max(0, Math.min(events.length - 1, Number(selectedIndex) || 0)) : -1;
  const visible = Math.max(1, rows);
  let start = 0;
  if (resolved >= visible) start = resolved - visible + 1;
  const slice = events.slice(start, start + visible);
  const lines = slice.map((event, index) => {
    const absolute = start + index;
    const marker = absolute === resolved ? hpaint('▸', 'nav', mode) : ' ';
    const time = hpaint(fmtTime(event.atMs), 'dim', mode);
    const category = hpaint(eventCategory(event).padEnd(9), eventToken(event), mode);
    const duration = finiteOrNull(event.durationMs) != null ? hpaint(` ${fmtDuration(event.durationMs)}`, 'dim', mode) : '';
    return `${marker} ${time}  ${category}  ${hpaint(event.label || event.tool || event.rawType || '--', eventToken(event), mode)}${duration}`;
  });
  if (!lines.length) lines.push(hpaint('No timeline events match current filter/search.', 'dim', mode));
  return { events, selectedIndex: resolved, selected: resolved >= 0 ? events[resolved] : null, lines };
}

function detailValueLines(label, value, width, maxLines = 5) {
  if (value === null || value === undefined || value === '') return [];
  const text = String(value);
  const chunk = Math.max(20, width - 16);
  const lines = [];
  for (let offset = 0; offset < text.length && lines.length < maxLines; offset += chunk) {
    const prefix = lines.length === 0 ? `${label.padEnd(12)} ` : ' '.repeat(13);
    lines.push(`${prefix}${text.slice(offset, offset + chunk)}`);
  }
  if (text.length > chunk * maxLines) lines.push(`${' '.repeat(13)}…`);
  return lines;
}

function eventDetailLines(event, width) {
  if (!event) return ['No timeline event selected.'];
  const lines = [
    `Time         ${fmtDate(event.atMs)}`,
    `Category     ${event.category ?? '--'}${event.group && event.group !== event.category ? ` / ${event.group}` : ''}`,
    `Raw type     ${event.rawType ?? '--'}`
  ];
  if (event.tool) lines.push(`Tool         ${event.tool}`);
  if (event.callId) lines.push(`Call ID      ${event.callId}`);
  if (event.turnId) lines.push(`Turn ID      ${event.turnId}`);
  if (event.role) lines.push(`Role         ${event.role}`);
  if (finiteOrNull(event.durationMs) != null) lines.push(`Duration     ${fmtDuration(event.durationMs)}`);
  if (event.status) lines.push(`Status       ${event.status}`);
  if (finiteOrNull(event.exitCode) != null) lines.push(`Exit code    ${event.exitCode}`);
  lines.push(...detailValueLines('Command', event.command, width, 4));
  lines.push(...detailValueLines('CWD', event.cwd, width, 2));
  lines.push(...detailValueLines('Path', event.path, width, 2));
  lines.push(...detailValueLines('Query', event.query, width, 3));
  lines.push(...detailValueLines('Detail', event.detail, width, 4));
  lines.push(...detailValueLines('Input', event.input, width, 6));
  lines.push(...detailValueLines('Output', event.output, width, 8));
  return lines;
}

function renderWideAnalyticsTab(detail, tab, safeWidth, bodyHeight, mode) {
  const leftWidth = Math.max(48, Math.floor(safeWidth * 0.42));
  const rightWidth = safeWidth - leftWidth - 1;
  if (rightWidth < 56) return null;

  if (tab === 'tokens') {
    const left = panel(tokenSummaryLines(detail, leftWidth - 4, mode), leftWidth, bodyHeight, { title: 'TOKEN SUMMARY / CUMULATIVE', mode, active: true });
    const right = panel(tokenTurnLines(detail, rightWidth - 4, mode, Math.max(8, bodyHeight - 9)), rightWidth, bodyHeight, { title: 'TOKEN I/O / TURN', mode });
    return join(left, right, leftWidth, bodyHeight);
  }
  if (tab === 'turns') {
    const left = panel(turnChartLines(detail, leftWidth - 4, mode), leftWidth, bodyHeight, { title: 'TURN DYNAMICS', mode, active: true });
    const right = panel(turnTableOnlyLines(detail, mode, Math.max(10, bodyHeight - 3)), rightWidth, bodyHeight, { title: 'TURN HISTORY', mode });
    return join(left, right, leftWidth, bodyHeight);
  }
  if (tab === 'tools') {
    const left = panel(toolSummaryLines(detail, leftWidth - 4, mode), leftWidth, bodyHeight, { title: 'TOOL DYNAMICS / SHARE', mode, active: true });
    const right = panel(toolEventLines(detail, Math.max(10, bodyHeight - 3)), rightWidth, bodyHeight, { title: 'RECENT TOOL EVENTS', mode });
    return join(left, right, leftWidth, bodyHeight);
  }
  return null;
}

export function renderSessionInspect({
  detail,
  width = 120,
  height = 36,
  mode = '256',
  activeTab = 'info',
  timelineFilter = 'all',
  timelineSearch = '',
  timelineSearchDraft = '',
  timelineSearching = false,
  timelineSelectedIndex = 0,
  timelineDetail = false
} = {}) {
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const tab = MANAGER_INSPECT_TABS.includes(activeTab) ? activeTab : 'info';
  const state = detail?.state ?? 'UNKNOWN';
  const title = detail?.info?.project ?? detail?.info?.threadId ?? 'SESSION';
  const header = truncateCells(`${hpaint('CODEX // SESSION INSPECT', 'strong', mode)}  ${hpaint(String(state), state === 'LIVE' ? 'live' : 'secondary', mode)}  ${title}`, safeWidth, '');
  const tabs = truncateCells(tabsLine(tab, mode), safeWidth, '');
  const lines = [header, tabs];
  let timeline = null;

  if (!detail) {
    const bodyHeight = safeHeight - 3;
    lines.push(...panel(['Selected session detail is unavailable.'], safeWidth, bodyHeight, { title: 'SESSION', mode, active: true }));
  } else if (tab === 'timeline') {
    const query = timelineSearching ? timelineSearchDraft : timelineSearch;
    const status = timelineSearching
      ? `${hpaint('SEARCH', 'nav', mode)} /${query}`
      : `${hpaint('FILTER', 'label', mode)} ${String(timelineFilter).toUpperCase()}  ${hpaint('SEARCH', 'label', mode)} ${query || '--'}  ${hpaint('EVENTS', 'label', mode)} ${filterSessionTimeline(detail.timeline, { filter: timelineFilter, search: query }).length}/${detail.timeline?.length ?? 0}`;
    lines.push(truncateCells(status, safeWidth, ''));
    const bodyHeight = Math.max(5, safeHeight - 4);
    timeline = timelineView(detail, {
      filter: timelineFilter,
      search: query,
      selectedIndex: timelineSelectedIndex,
      rows: Math.max(1, bodyHeight - 2),
      mode
    });
    const body = timelineDetail ? eventDetailLines(timeline.selected, safeWidth - 4) : timeline.lines;
    lines.push(...panel(body, safeWidth, bodyHeight, {
      title: timelineDetail ? 'EVENT DETAIL' : 'TIMELINE / AUDIT',
      mode,
      active: true
    }));
  } else {
    const bodyHeight = safeHeight - 3;
    if (tab === 'info' && safeWidth >= 92) {
      const leftWidth = Math.max(38, Math.floor(safeWidth * 0.42));
      const rightWidth = safeWidth - leftWidth - 1;
      const left = panel(infoLines(detail), leftWidth, bodyHeight, { title: 'IDENTITY', mode, active: true });
      const right = panel(contextAnalyticsLines(detail, rightWidth - 4, mode), rightWidth, bodyHeight, { title: 'CONTEXT / EXACT TELEMETRY', mode });
      lines.push(...join(left, right, leftWidth, bodyHeight));
    } else if (safeWidth >= 120 && ['tokens', 'turns', 'tools'].includes(tab)) {
      const wide = renderWideAnalyticsTab(detail, tab, safeWidth, bodyHeight, mode);
      if (wide) lines.push(...wide);
      else {
        const titleByTab = { tokens: 'TOKENS / CUMULATIVE', turns: 'TURNS / DURATION', tools: 'TOOLS / SHARE' };
        lines.push(...panel(tabLines(detail, tab, safeWidth - 4, mode), safeWidth, bodyHeight, { title: titleByTab[tab], mode, active: true }));
      }
    } else {
      const titleByTab = {
        info: 'IDENTITY', tokens: 'TOKENS / CUMULATIVE', turns: 'TURNS / DURATION', tools: 'TOOLS / SHARE', resources: 'RESOURCES', errors: 'ERRORS / EVENTS'
      };
      lines.push(...panel(tabLines(detail, tab, safeWidth - 4, mode), safeWidth, bodyHeight, { title: titleByTab[tab], mode, active: true }));
    }
  }

  const footer = tab === 'timeline'
    ? (timelineDetail
        ? 'Q/Esc close detail   ↑/↓ select after close   Enter detail'
        : '↑/↓ select   PgUp/PgDn · Home/End   Enter detail   F filter   / search   Tab/←/→ tabs   Q/Esc back')
    : '←/→ or Tab change tab   Q/Esc back to dashboard   exact selected-session analytics only';
  lines.push(truncateCells(footer, safeWidth, ''));
  return {
    lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')),
    width: safeWidth,
    height: safeHeight,
    activeTab: tab,
    timelineFilter: MANAGER_TIMELINE_FILTERS.includes(timelineFilter) ? timelineFilter : 'all',
    timeline,
    detail
  };
}
