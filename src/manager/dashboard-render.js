import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from '../history/theme.js';
import { buildSessionDashboardModel, rowContextPercent } from './dashboard-model.js';

export const MANAGER_VIEW_MODES = Object.freeze(['operations', 'table', 'charts', 'auto']);

function fmtNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}
function fmtBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  if (n >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(1)}G`;
  if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(1)}M`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${Math.round(n)}B`;
}
function fmtDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '--';
  const total = Math.floor(n / 1000);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)}d${hours % 24}h`;
}
function fmtPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : '--';
}
function stateToken(state) {
  if (state === 'LIVE') return 'live';
  if (state === 'ENDED') return 'dim';
  return 'secondary';
}
function border(width, title, mode, active = false) {
  const label = title ? ` ${title} ` : '';
  const titleText = truncateCells(label, Math.max(0, width - 2), '');
  const titleWidth = Math.min(cellWidth(titleText), Math.max(0, width - 2));
  const left = hpaint('┌', active ? 'nav' : 'panel', mode);
  const right = hpaint('┐', active ? 'nav' : 'panel', mode);
  const line = hpaint('─'.repeat(Math.max(0, width - titleWidth - 2)), active ? 'nav' : 'panel', mode);
  return `${left}${hpaint(titleText, active ? 'nav' : 'heading', mode)}${line}${right}`;
}
function panel(content, width, height, { title = '', mode = '256', active = false } = {}) {
  if (height <= 0 || width <= 1) return [];
  const inner = Math.max(1, width - 2);
  const result = [border(width, title, mode, active)];
  for (let i = 0; i < Math.max(0, height - 2); i += 1) {
    const body = truncateCells(content[i] ?? '', inner, '');
    const edge = hpaint('│', active ? 'nav' : 'panel', mode);
    result.push(`${edge}${padCells(body, inner)}${edge}`);
  }
  result.push(hpaint(`└${'─'.repeat(inner)}┘`, active ? 'nav' : 'panel', mode));
  return result.slice(0, height);
}
function summaryLines(model, mode) {
  const s = model.summary;
  const pressure = s.highestContextPercent == null ? '--' : `${fmtPercent(s.highestContextPercent)} ${s.highestContextLabel ?? ''}`.trim();
  return [
    `${hpaint(String(s.live), 'live', mode)} LIVE   ${hpaint(String(s.ended), 'dim', mode)} ENDED   ${hpaint(String(s.unknown), 'secondary', mode)} UNKNOWN`,
    `${hpaint('Context peak', 'label', mode)}  ${hpaint(pressure, s.highestContextPercent >= 80 ? 'error' : s.highestContextPercent >= 60 ? 'pressure' : 'live', mode)}`,
    `${hpaint('Events', 'label', mode)}        ${hpaint(String(s.recentErrors), s.recentErrors ? 'error' : 'text', mode)} errors   ${s.recentRetries} retries   ${s.recentCompactions} compactions`,
    `${hpaint('Storage', 'label', mode)}       ${hpaint(fmtBytes(s.storageBytes), 'session', mode)} local JSONL`
  ];
}
function compactSummaryLines(model, mode) {
  const s = model.summary;
  const pressure = s.highestContextPercent == null ? '--' : `${fmtPercent(s.highestContextPercent)} ${s.highestContextLabel ?? ''}`.trim();
  return [
    `${hpaint(String(s.live), 'live', mode)} LIVE  ${hpaint(String(s.ended), 'dim', mode)} ENDED  ${hpaint(String(s.unknown), 'secondary', mode)} UNKNOWN    ${hpaint('CTX', 'label', mode)} ${hpaint(pressure, s.highestContextPercent >= 80 ? 'error' : s.highestContextPercent >= 60 ? 'pressure' : 'live', mode)}`,
    `${hpaint('Events', 'label', mode)} ${s.recentErrors} err · ${s.recentRetries} retry · ${s.recentCompactions} compact    ${hpaint('Storage', 'label', mode)} ${hpaint(fmtBytes(s.storageBytes), 'session', mode)}`
  ];
}
function shortSessionId(row) {
  const raw = String(row?.threadId ?? row?.name ?? '');
  if (!raw) return '--';
  if (raw.length <= 8) return raw;
  const compact = raw.replace(/[^a-zA-Z0-9]/g, '');
  return (compact || raw).slice(-8);
}
function liveLines(model, width, mode) {
  const live = model.rows.filter((row) => row.state === 'LIVE').slice(0, 6);
  if (!live.length) return [hpaint('No active sessions in current scope.', 'dim', mode)];
  return live.map((row) => {
    const projectWidth = Math.min(20, Math.max(8, width - 28));
    const project = padCells(truncateCells(row.project ?? row.name ?? '--', projectWidth, '…'), projectWidth);
    return `${hpaint('●', 'live', mode)} ${hpaint(project, 'text', mode)} ${hpaint(shortSessionId(row), 'session', mode)}  ${hpaint(fmtPercent(rowContextPercent(row)).padStart(4), 'pressure', mode)}  ${hpaint(fmtNum(row.tokens?.input).padStart(7), 'secondary', mode)}  ${hpaint(`${fmtNum(row.toolCount ?? row.observedToolCount)}t`, 'live', mode)}`;
  });
}
function selectedPosition(model) {
  if (!model.selected || model.selectedIndex < 0 || !model.rows.length) return 'SELECTED --';
  return `SELECTED ${model.selectedIndex + 1}/${model.rows.length}`;
}
function selectedPreviewLines(model, mode) {
  const row = model.selected;
  if (!row) return [hpaint('No session selected.', 'dim', mode)];
  return [
    `${hpaint('▸', 'nav', mode)} ${hpaint(`${model.selectedIndex + 1}/${model.rows.length}`, 'session', mode)}  ${hpaint(row.project ?? row.name ?? '--', 'text', mode)} · ${hpaint(row.state ?? 'UNKNOWN', stateToken(row.state), mode)}`,
    `${hpaint('Session', 'label', mode)}    ${hpaint(truncateCells(row.threadId ?? row.name ?? '--', 30, '…'), 'session', mode)}`,
    `${hpaint('Model', 'label', mode)}      ${hpaint(row.model ?? '--', 'secondary', mode)}`,
    `${hpaint('Context', 'label', mode)}    ${hpaint(fmtPercent(rowContextPercent(row)), 'pressure', mode)}    ${hpaint('Input', 'label', mode)} ${hpaint(fmtNum(row.tokens?.input), 'secondary', mode)}`,
    `${hpaint('Turns', 'label', mode)}      ${fmtNum(row.turnCount ?? row.observedTurnCount)}    ${hpaint('Tools', 'label', mode)} ${hpaint(fmtNum(row.toolCount ?? row.observedToolCount), 'live', mode)}`,
    `${hpaint('Size', 'label', mode)}       ${fmtBytes(row.fileSizeBytes)}`,
    `${hpaint('Enter', 'nav', mode)}      inspect selected session`
  ];
}
function chartLines(items, width, formatter, mode, token = 'nav') {
  if (!items.length) return [hpaint('No evidenced data in current scope.', 'dim', mode)];
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  const labelWidth = Math.max(10, Math.min(24, Math.floor(width * 0.42)));
  const valueWidth = 7;
  const barWidth = Math.max(5, width - labelWidth - valueWidth - 5);
  return items.map((item) => {
    const ratio = Math.max(0, Math.min(1, Number(item.value) / max));
    const filled = Math.max(item.value > 0 ? 1 : 0, Math.round(barWidth * ratio));
    const active = '━'.repeat(Math.min(barWidth, filled));
    const track = '·'.repeat(Math.max(0, barWidth - filled));
    const label = padCells(truncateCells(item.label, labelWidth, '…'), labelWidth);
    const value = String(formatter(item.value)).padStart(valueWidth);
    return `${hpaint(label, item.state === 'LIVE' ? 'live' : 'session', mode)} ${hpaint('│', 'grid', mode)}${hpaint(active, token, mode)}${hpaint(track, 'grid', mode)}${hpaint('│', 'grid', mode)} ${hpaint(value, token, mode)}`;
  });
}
function valuesFrom(samples, key) {
  return Array.isArray(samples) ? samples.map((s) => Number.isFinite(Number(s?.[key])) ? Number(s[key]) : null) : [];
}
function latestKnown(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) if (Number.isFinite(values[i])) return values[i];
  return null;
}
function maxKnown(values, fallback = 1) {
  const known = values.filter(Number.isFinite);
  return known.length ? Math.max(...known, fallback) : fallback;
}
function spark(values, width, mode, token, fixedMax = null) {
  const blocks = '▁▂▃▄▅▆▇█';
  const count = Math.max(8, width);
  const src = values.slice(-count);
  const cols = [...Array(Math.max(0, count - src.length)).fill(null), ...src];
  const max = fixedMax ?? maxKnown(values, 1);
  return hpaint(cols.map((value) => {
    if (!Number.isFinite(value)) return ' ';
    if (value <= 0) return '▁';
    return blocks[Math.max(0, Math.min(7, Math.round((value / Math.max(1, max)) * 7)))];
  }).join(''), token, mode);
}
function eventTicks(values, width, mode) {
  const count = Math.max(8, width);
  const src = values.slice(-count);
  const cols = [...Array(Math.max(0, count - src.length)).fill(null), ...src];
  return cols.map((value) => {
    if (!Number.isFinite(value) || value <= 0) return hpaint('·', 'grid', mode);
    if (value >= 10) return hpaint('█', 'live', mode);
    if (value >= 3) return hpaint('┃', 'live', mode);
    return hpaint('│', 'live', mode);
  }).join('');
}
function gauge(percent, width, mode) {
  const value = Number(percent);
  if (!Number.isFinite(value)) return hpaint('·'.repeat(Math.max(4, width)), 'grid', mode);
  const safe = Math.max(0, Math.min(100, value));
  const full = Math.round((safe / 100) * width);
  const token = safe >= 80 ? 'error' : safe >= 60 ? 'pressure' : 'live';
  return `${hpaint('━'.repeat(full), token, mode)}${hpaint('·'.repeat(Math.max(0, width - full)), 'grid', mode)}`;
}
function timeAxis(width, mode) {
  const usable = Math.max(12, width - 9);
  return `${hpaint('−60s', 'dim', mode)}${hpaint('┈'.repeat(usable), 'grid', mode)}${hpaint('now', 'dim', mode)}`;
}
function metricBlock(label, current, graph, right, mode, token) {
  return [
    `${hpaint(label, 'heading', mode)}  ${hpaint(current, token, mode)}${right ? `  ${hpaint(right, 'dim', mode)}` : ''}`,
    graph
  ];
}
function aggregateTelemetryLines(telemetry, width, mode) {
  const samples = telemetry?.samples ?? [];
  const tokenValues = valuesFrom(samples, 'tokenRate');
  const toolValues = valuesFrom(samples, 'toolRate');
  const contextValues = valuesFrom(samples, 'contextPeak');
  const tokenNow = latestKnown(tokenValues);
  const toolNow = latestKnown(toolValues);
  const contextNow = latestKnown(contextValues);
  const graphWidth = Math.max(18, width - 2);
  const out = [
    `${hpaint('LIVE FEED', 'label', mode)}  ${hpaint(String(telemetry?.latest?.activeCount ?? 0), 'live', mode)} active   ${hpaint('window 60s', 'dim', mode)}   ${hpaint(`samples ${telemetry?.sampleCount ?? 0}`, 'dim', mode)}`,
    ''
  ];
  out.push(...metricBlock('TOKEN RATE', `${fmtNum(tokenNow)}/min`, spark(tokenValues, graphWidth, mode, 'secondary'), `peak ${fmtNum(maxKnown(tokenValues, 0))}/m`, mode, 'secondary'));
  out.push('');
  out.push(...metricBlock('TOOL EVENTS', `${fmtNum(toolNow)}/min`, eventTicks(toolValues, graphWidth, mode), `peak ${fmtNum(maxKnown(toolValues, 0))}/m`, mode, 'live'));
  out.push('');
  out.push(...metricBlock('CONTEXT', fmtPercent(contextNow), gauge(contextNow, graphWidth, mode), '0% → 100%', mode, 'pressure'));
  out.push(timeAxis(graphWidth, mode));
  return out;
}
function liveTelemetryRows(telemetry, width, mode, limit = 6) {
  const sessions = Array.isArray(telemetry?.sessions) ? telemetry.sessions.slice(0, limit) : [];
  if (!sessions.length) return [hpaint('No LIVE session telemetry yet.', 'dim', mode)];
  const graphWidth = Math.max(10, width - 62);
  const rows = [
    `${hpaint('PROJECT', 'label', mode).padEnd(20)} ${hpaint('SESSION', 'label', mode)} ${hpaint('TOKEN 60s', 'label', mode)} ${hpaint('RATE', 'label', mode).padStart(8)} ${hpaint('CTX', 'label', mode).padStart(4)} ${hpaint('TOOLS', 'label', mode).padStart(6)}`
  ];
  for (const session of sessions) {
    const tokenValues = valuesFrom(session.samples, 'tokenRate');
    const toolValues = valuesFrom(session.samples, 'toolRate');
    const tokenNow = latestKnown(tokenValues);
    const toolNow = latestKnown(toolValues);
    const ctx = session.latest?.context;
    const name = padCells(truncateCells(session.project ?? 'session', 16, '…'), 16);
    const id = padCells(shortSessionId(session), 8);
    rows.push(`${hpaint('●', 'live', mode)} ${hpaint(name, 'text', mode)} ${hpaint(id, 'session', mode)} ${spark(tokenValues, graphWidth, mode, 'secondary')} ${hpaint(`${fmtNum(tokenNow)}/m`.padStart(8), 'secondary', mode)} ${hpaint(fmtPercent(ctx).padStart(4), Number(ctx) >= 80 ? 'error' : Number(ctx) >= 60 ? 'pressure' : 'live', mode)} ${hpaint(`${fmtNum(toolNow)}/m`.padStart(6), 'live', mode)}`);
  }
  return rows;
}
const COLUMN_SPECS = Object.freeze({
  state: { title: 'STATE', width: 8, value: (row) => row.state ?? 'UNKNOWN' },
  project: { title: 'PROJECT', width: 18, value: (row) => row.project ?? row.name ?? '--' },
  session: { title: 'SESSION', width: 10, value: (row) => shortSessionId(row) },
  model: { title: 'MODEL', width: 14, value: (row) => row.model ?? '--' },
  duration: { title: 'DURATION', width: 9, value: (row) => fmtDuration(row.elapsedMs) },
  context: { title: 'CONTEXT', width: 8, value: (row) => fmtPercent(rowContextPercent(row)) },
  input: { title: 'INPUT', width: 8, value: (row) => fmtNum(row.tokens?.input) },
  cache: { title: 'CACHE', width: 8, value: (row) => fmtNum(row.tokens?.cached) },
  turn: { title: 'TURN', width: 6, value: (row) => fmtNum(row.turnCount ?? row.observedTurnCount) },
  tools: { title: 'TOOLS', width: 6, value: (row) => fmtNum(row.toolCount ?? row.observedToolCount) },
  size: { title: 'SIZE', width: 8, value: (row) => fmtBytes(row.fileSizeBytes) }
});
function tableColumns(width) {
  if (width < 72) return ['state', 'project', 'context', 'tools'];
  if (width < 104) return ['state', 'project', 'session', 'context', 'tools'];
  if (width < 150) return ['state', 'project', 'session', 'model', 'duration', 'context', 'input', 'tools'];
  return ['state', 'project', 'session', 'model', 'duration', 'context', 'input', 'cache', 'turn', 'tools', 'size'];
}
function fitColumns(columns, width) {
  const selected = [...columns];
  const total = () => selected.reduce((sum, key) => sum + COLUMN_SPECS[key].width, 0) + Math.max(0, selected.length - 1);
  while (selected.length > 2 && total() > width) selected.splice(selected.length - 1, 1);
  return selected;
}
function tableLines(model, width, rows, mode, maxDataRows = null) {
  const markerWidth = 2;
  const columns = fitColumns(tableColumns(width), width - markerWidth);
  const output = [hpaint(`${' '.repeat(markerWidth)}${columns.map((key) => padCells(COLUMN_SPECS[key].title, COLUMN_SPECS[key].width)).join(' ')}`, 'label', mode)];
  if (!model.rows.length) return [...output, hpaint('No sessions match current query.', 'dim', mode)];
  const visibleByHeight = Math.max(1, rows - 1);
  const visible = maxDataRows == null ? visibleByHeight : Math.max(1, Math.min(visibleByHeight, maxDataRows));
  const selected = Math.max(0, model.selectedIndex);
  const start = Math.max(0, Math.min(selected - Math.floor(visible / 2), Math.max(0, model.rows.length - visible)));
  for (let index = start; index < Math.min(model.rows.length, start + visible); index += 1) {
    const row = model.rows[index];
    const isSelected = index === model.selectedIndex;
    const cells = columns.map((key) => {
      const spec = COLUMN_SPECS[key];
      const raw = truncateCells(spec.value(row), spec.width, '…');
      let value = raw;
      if (!isSelected && key === 'state') value = hpaint(raw, stateToken(row.state), mode);
      else if (!isSelected && key === 'project') value = hpaint(raw, 'text', mode);
      else if (!isSelected && key === 'session') value = hpaint(raw, 'session', mode);
      else if (!isSelected && key === 'model') value = hpaint(raw, 'dim', mode);
      else if (!isSelected && key === 'context') {
        const pct = rowContextPercent(row);
        value = hpaint(raw, pct >= 80 ? 'error' : pct >= 60 ? 'pressure' : pct != null ? 'live' : 'dim', mode);
      }
      return padCells(value, spec.width);
    });
    const text = `${isSelected ? '▸' : ' '} ${cells.join(' ')}`;
    output.push(isSelected ? hpaint(text, 'selected', mode) : text);
  }
  return output;
}
export function dashboardLayoutMode(width) {
  if (width < 78) return 'narrow';
  if (width < 122) return 'normal';
  if (width < 176) return 'wide';
  return 'ultrawide';
}
export function resolveManagerViewMode(viewMode, layout) {
  const requested = MANAGER_VIEW_MODES.includes(String(viewMode).toLowerCase()) ? String(viewMode).toLowerCase() : 'operations';
  if (requested !== 'auto') return requested;
  if (layout === 'narrow') return 'table';
  if (layout === 'ultrawide') return 'charts';
  return 'operations';
}
function joinPanels(left, right, leftWidth, height) {
  const lines = [];
  for (let i = 0; i < height; i += 1) lines.push(`${left[i] ?? ''.padEnd(leftWidth)} ${right[i] ?? ''}`);
  return lines;
}
function tablePanelTitle(prefix, model) {
  return `${prefix} ${model.rows.length}/${model.summary.total}  ${selectedPosition(model)}`;
}
function renderTableView(lines, model, width, bodyHeight, mode) {
  const summaryHeight = 4;
  lines.push(...panel(compactSummaryLines(model, mode), width, summaryHeight, { title: 'SESSION INDEX', mode }));
  lines.push(...panel(tableLines(model, width - 2, bodyHeight - summaryHeight - 2, mode), width, bodyHeight - summaryHeight, { title: tablePanelTitle('SESSIONS', model), mode, active: true }));
}
function renderOperationsView(lines, model, width, bodyHeight, mode, layout, telemetry) {
  if (layout === 'narrow') return renderTableView(lines, model, width, bodyHeight, mode);
  const topHeight = 7;
  const middleHeight = Math.max(11, Math.min(14, Math.floor(bodyHeight * 0.38)));
  const tableHeight = Math.max(5, bodyHeight - topHeight - middleHeight);
  const leftWidth = Math.max(34, Math.floor(width * 0.5));
  const rightWidth = width - leftWidth - 1;
  lines.push(...joinPanels(
    panel(liveLines(model, leftWidth - 2, mode), leftWidth, topHeight, { title: 'CURRENT / LIVE', mode }),
    panel(summaryLines(model, mode), rightWidth, topHeight, { title: 'STATUS / EVENTS', mode }),
    leftWidth,
    topHeight
  ));
  lines.push(...joinPanels(
    panel(aggregateTelemetryLines(telemetry, leftWidth - 4, mode), leftWidth, middleHeight, { title: 'LIVE TELEMETRY · 60s', mode }),
    panel(selectedPreviewLines(model, mode), rightWidth, middleHeight, { title: 'SELECTED SESSION', mode, active: true }),
    leftWidth,
    middleHeight
  ));
  lines.push(...panel(tableLines(model, width - 2, tableHeight - 2, mode, 4), width, tableHeight, { title: tablePanelTitle('RECENT SESSIONS', model), mode }));
}
function renderChartsView(lines, model, width, bodyHeight, mode, layout, telemetry) {
  if (layout === 'narrow') return renderTableView(lines, model, width, bodyHeight, mode);
  const aggregateHeight = 12;
  const liveHeight = Math.max(7, Math.min(10, Math.floor(bodyHeight * 0.22)));
  const rankingHeight = Math.max(7, Math.min(9, Math.floor(bodyHeight * 0.2)));
  const recentHeight = Math.max(5, bodyHeight - aggregateHeight - liveHeight - rankingHeight);
  lines.push(...panel(aggregateTelemetryLines(telemetry, width - 4, mode), width, aggregateHeight, { title: 'SYSTEM MOTION · LIVE ONLY · ROLLING 60s', mode }));
  lines.push(...panel(liveTelemetryRows(telemetry, width - 4, mode, Math.max(1, liveHeight - 3)), width, liveHeight, { title: 'LIVE SESSIONS · TOKEN / RATE / CONTEXT / TOOLS', mode }));
  const leftWidth = Math.max(34, Math.floor(width * 0.5));
  const rightWidth = width - leftWidth - 1;
  lines.push(...joinPanels(
    panel(chartLines(model.charts.tokens, leftWidth - 2, fmtNum, mode, 'secondary').slice(0, Math.max(1, rankingHeight - 2)), leftWidth, rankingHeight, { title: 'TOP TOKEN TOTAL · current scope', mode }),
    panel(chartLines(model.charts.context, rightWidth - 2, fmtPercent, mode, 'pressure').slice(0, Math.max(1, rankingHeight - 2)), rightWidth, rankingHeight, { title: 'TOP CONTEXT · current scope', mode }),
    leftWidth,
    rankingHeight
  ));
  lines.push(...panel(tableLines(model, width - 2, recentHeight - 2, mode, 3), width, recentHeight, { title: tablePanelTitle('RECENT / SELECT', model), mode }));
}
export function renderSessionDashboard({ rows = [], width = 120, height = 36, mode = '256', scope = 'all', search = '', sortBy = 'lastActivity', direction = 'desc', selectedId = null, selectedIndex = 0, viewMode = 'operations', telemetry = null } = {}) {
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const layout = dashboardLayoutMode(safeWidth);
  const resolvedView = resolveManagerViewMode(viewMode, layout);
  const model = buildSessionDashboardModel(rows, { scope, search, sortBy, direction, selectedId, selectedIndex });
  const header = truncateCells(`${hpaint('CODEX // SESSION MANAGER', 'strong', mode)}  ${hpaint(`${model.summary.live} LIVE`, model.summary.live ? 'live' : 'dim', mode)}  ${hpaint(`${model.summary.total} LOCAL`, 'text', mode)}  ${hpaint(resolvedView.toUpperCase(), 'session', mode)}  ${hpaint(layout.toUpperCase(), 'dim', mode)}`, safeWidth, '');
  const queryLine = truncateCells(`${hpaint('Scope', 'label', mode)} ${hpaint(model.query.scope.toUpperCase(), 'nav', mode)}  ${hpaint('Search', 'label', mode)} ${model.query.search || '--'}  ${hpaint('Sort', 'label', mode)} ${hpaint(`${model.query.sortBy}:${model.query.direction}`, 'session', mode)}  ${hpaint('View', 'label', mode)} ${hpaint(String(viewMode).toUpperCase(), 'secondary', mode)}`, safeWidth, '');
  const footer = truncateCells(hpaint(safeWidth < 78 ? '↑↓ select  Enter inspect  / search  V view  Q quit' : '↑↓ select  Enter inspect  / search  F scope  S sort  D dir  V view  Q/Esc quit', 'dim', mode), safeWidth, '');
  const lines = [header, queryLine];
  const bodyHeight = safeHeight - 3;
  if (resolvedView === 'table') renderTableView(lines, model, safeWidth, bodyHeight, mode);
  else if (resolvedView === 'charts') renderChartsView(lines, model, safeWidth, bodyHeight, mode, layout, telemetry);
  else renderOperationsView(lines, model, safeWidth, bodyHeight, mode, layout, telemetry);
  lines.push(footer);
  return { lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')), width: safeWidth, height: safeHeight, layout, viewMode: resolvedView, requestedViewMode: viewMode, model };
}
