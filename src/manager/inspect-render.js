import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from '../history/theme.js';
import { filterSessionTimeline, MANAGER_TIMELINE_FILTERS } from './timeline.js';

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

function tabLines(detail, tab) {
  if (tab === 'tokens') return telemetryLines(detail).slice(0, 5);
  if (tab === 'turns') return [
    `Turns        ${fmtNum(detail.turns?.count)}`,
    `Completed    ${fmtNum(detail.turns?.completed)}`,
    `Last turn    ${fmtDuration(detail.turns?.lastDurationMs)}`
  ];
  if (tab === 'tools') {
    const tools = Array.isArray(detail.tools?.byName) ? detail.tools.byName : [];
    return [`Total tools  ${fmtNum(detail.tools?.count)}`, '', ...tools.slice(0, 12).map((item) => `${String(fmtNum(item.count)).padStart(6)}  ${item.name ?? '--'}`)];
  }
  if (tab === 'resources') {
    const evidence = Array.isArray(detail.resources?.evidence) ? detail.resources.evidence : [];
    return evidence.length
      ? evidence.slice(0, 14).map((item) => `${item.kind ?? '--'}  ${item.value ?? '--'}`)
      : ['No historical resource evidence.', '', 'Resources are evidence-based; current filesystem state is not inferred.'];
  }
  if (tab === 'errors') {
    const errors = Array.isArray(detail.errors) ? detail.errors : [];
    return errors.length
      ? errors.slice(-14).reverse().map((item) => `${fmtTime(item.atMs)}  ${item.detail ?? '--'}`)
      : ['No recorded errors in selected session.'];
  }
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
      const leftWidth = Math.max(38, Math.floor(safeWidth * 0.5));
      const rightWidth = safeWidth - leftWidth - 1;
      const left = panel(infoLines(detail), leftWidth, bodyHeight, { title: 'IDENTITY', mode, active: true });
      const right = panel(telemetryLines(detail), rightWidth, bodyHeight, { title: 'EXACT TELEMETRY', mode });
      lines.push(...join(left, right, leftWidth, bodyHeight));
    } else {
      const titleByTab = {
        info: 'IDENTITY', tokens: 'TOKENS', turns: 'TURNS', tools: 'TOOLS', resources: 'RESOURCES', errors: 'ERRORS'
      };
      lines.push(...panel(tabLines(detail, tab), safeWidth, bodyHeight, { title: titleByTab[tab], mode, active: true }));
    }
  }

  const footer = tab === 'timeline'
    ? (timelineDetail
        ? 'Q/Esc close detail   ↑/↓ select after close   Enter detail'
        : '↑/↓ select   PgUp/PgDn · Home/End   Enter detail   F filter   / search   Tab/←/→ tabs   Q/Esc back')
    : '←/→ or Tab change tab   Q/Esc back to dashboard   exact selected-session history only';
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
