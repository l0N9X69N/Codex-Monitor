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
  const left = active ? '╔' : '┌';
  const right = active ? '╗' : '┐';
  const dash = active ? '═' : '─';
  const titleWidth = Math.min(cellWidth(label), Math.max(0, width - 2));
  return hpaint(`${left}${truncateCells(label, Math.max(0, width - 2), '')}${dash.repeat(Math.max(0, width - titleWidth - 2))}${right}`, active ? 'nav' : 'panel', mode);
}

function panel(content, width, height, { title = '', mode = '256', active = false } = {}) {
  if (height <= 0 || width <= 1) return [];
  const inner = Math.max(1, width - 2);
  const result = [border(width, title, mode, active)];
  for (let index = 0; index < Math.max(0, height - 2); index += 1) {
    const body = truncateCells(content[index] ?? '', inner, '');
    const edge = hpaint(active ? '║' : '│', active ? 'nav' : 'panel', mode);
    result.push(`${edge}${padCells(body, inner)}${edge}`);
  }
  const edge = active ? '╚' : '└';
  const end = active ? '╝' : '┘';
  const dash = active ? '═' : '─';
  result.push(hpaint(`${edge}${dash.repeat(inner)}${end}`, active ? 'nav' : 'panel', mode));
  return result.slice(0, height);
}

function summaryLines(model, mode) {
  const summary = model.summary;
  const pressure = summary.highestContextPercent == null
    ? '--'
    : `${fmtPercent(summary.highestContextPercent)} ${summary.highestContextLabel ?? ''}`.trim();
  return [
    `${hpaint(String(summary.live), 'live', mode)} LIVE   ${summary.ended} ENDED   ${summary.unknown} UNKNOWN`,
    `Context peak  ${hpaint(pressure, summary.highestContextPercent >= 80 ? 'pressure' : 'text', mode)}`,
    `Events        ${hpaint(String(summary.recentErrors), summary.recentErrors ? 'error' : 'text', mode)} errors   ${summary.recentRetries} retries   ${summary.recentCompactions} compactions`,
    `Storage       ${fmtBytes(summary.storageBytes)} local JSONL`
  ];
}

function liveLines(model, width, mode) {
  const live = model.rows.filter((row) => row.state === 'LIVE').slice(0, 6);
  if (!live.length) return ['No active Codex sessions.'];
  return live.map((row) => {
    const labelWidth = Math.max(8, Math.min(22, Math.floor(width * 0.42)));
    const project = padCells(truncateCells(row.project ?? row.name ?? '--', labelWidth, '…'), labelWidth);
    const context = fmtPercent(rowContextPercent(row)).padStart(5);
    const input = fmtNum(row.tokens?.input).padStart(7);
    const tools = fmtNum(row.toolCount ?? row.observedToolCount).padStart(4);
    return `${hpaint('●', 'live', mode)} ${project} ${context} ${input} ${tools}t`;
  });
}

function selectedPosition(model) {
  if (!model.selected || model.selectedIndex < 0 || !model.rows.length) return 'SELECTED --';
  return `SELECTED ${model.selectedIndex + 1}/${model.rows.length}`;
}

function selectedPreviewLines(model, mode) {
  const row = model.selected;
  if (!row) return ['No session selected.'];
  const state = hpaint(row.state ?? 'UNKNOWN', stateToken(row.state), mode);
  return [
    `${hpaint('>', 'nav', mode)} ${model.selectedIndex + 1}/${model.rows.length}  ${row.project ?? row.name ?? '--'} · ${state}`,
    `Model      ${row.model ?? '--'}`,
    `Context    ${fmtPercent(rowContextPercent(row))}`,
    `Input      ${fmtNum(row.tokens?.input)}   Cache ${fmtNum(row.tokens?.cached)}`,
    `Turns      ${fmtNum(row.turnCount ?? row.observedTurnCount)}   Tools ${fmtNum(row.toolCount ?? row.observedToolCount)}`,
    `Size       ${fmtBytes(row.fileSizeBytes)}`,
    'Enter      inspect selected session'
  ];
}

function chartLines(items, width, formatter, mode) {
  if (!items.length) return ['No evidenced data yet.'];
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  const labelWidth = Math.max(8, Math.min(18, Math.floor(width * 0.34)));
  const valueWidth = 7;
  const barWidth = Math.max(4, width - labelWidth - valueWidth - 3);
  return items.map((item) => {
    const ratio = Math.max(0, Math.min(1, Number(item.value) / max));
    const filled = Math.max(item.value > 0 ? 1 : 0, Math.round(barWidth * ratio));
    const bar = `${'█'.repeat(Math.min(barWidth, filled))}${'░'.repeat(Math.max(0, barWidth - filled))}`;
    const label = truncateCells(item.label, labelWidth, '…');
    const token = item.state === 'LIVE' ? 'live' : 'text';
    return `${padCells(label, labelWidth)} ${hpaint(bar, token, mode)} ${String(formatter(item.value)).padStart(valueWidth)}`;
  });
}

const COLUMN_SPECS = Object.freeze({
  state: { title: 'STATE', width: 8, value: (row) => row.state ?? 'UNKNOWN' },
  project: { title: 'PROJECT', width: 18, value: (row) => row.project ?? row.name ?? '--' },
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
  if (width < 104) return ['state', 'project', 'model', 'duration', 'context', 'tools'];
  if (width < 150) return ['state', 'project', 'model', 'duration', 'context', 'input', 'turn', 'tools'];
  return ['state', 'project', 'model', 'duration', 'context', 'input', 'cache', 'turn', 'tools', 'size'];
}

function fitColumns(columns, width) {
  const selected = [...columns];
  const totalWidth = () => selected.reduce((sum, key) => sum + COLUMN_SPECS[key].width, 0) + Math.max(0, selected.length - 1);
  while (selected.length > 2 && totalWidth() > width) selected.splice(selected.length - 1, 1);
  return selected;
}

function tableLines(model, width, rows, mode) {
  const markerWidth = 2;
  const columns = fitColumns(tableColumns(width), width - markerWidth);
  const header = `${' '.repeat(markerWidth)}${columns.map((key) => padCells(COLUMN_SPECS[key].title, COLUMN_SPECS[key].width)).join(' ')}`;
  const output = [hpaint(header, 'dim', mode)];
  if (!model.rows.length) {
    output.push('No sessions match current query.');
    return output;
  }
  const visible = Math.max(1, rows - 1);
  const selected = Math.max(0, model.selectedIndex);
  const start = Math.max(0, Math.min(selected - Math.floor(visible / 2), Math.max(0, model.rows.length - visible)));
  for (let index = start; index < Math.min(model.rows.length, start + visible); index += 1) {
    const row = model.rows[index];
    const cells = columns.map((key) => {
      const spec = COLUMN_SPECS[key];
      let value = truncateCells(spec.value(row), spec.width, '…');
      if (key === 'state') value = hpaint(value, stateToken(row.state), mode);
      return padCells(value, spec.width);
    });
    const isSelected = index === model.selectedIndex;
    const marker = isSelected ? hpaint('>', 'nav', mode) : ' ';
    const text = `${marker} ${cells.join(' ')}`;
    output.push(isSelected ? hpaint(text, 'nav', mode) : text);
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
  const requested = MANAGER_VIEW_MODES.includes(String(viewMode).toLowerCase())
    ? String(viewMode).toLowerCase()
    : 'operations';
  if (requested !== 'auto') return requested;
  if (layout === 'narrow') return 'table';
  if (layout === 'ultrawide') return 'charts';
  return 'operations';
}

function joinPanels(left, right, leftWidth, height) {
  const lines = [];
  for (let index = 0; index < height; index += 1) {
    lines.push(`${left[index] ?? ''.padEnd(leftWidth)} ${right[index] ?? ''}`);
  }
  return lines;
}

function tablePanelTitle(prefix, model) {
  return `${prefix} ${model.rows.length}/${model.summary.total}  ${selectedPosition(model)}`;
}

function renderTableView(lines, model, safeWidth, bodyHeight, mode) {
  const summaryHeight = Math.min(6, Math.max(5, Math.floor(bodyHeight * 0.2)));
  lines.push(...panel(summaryLines(model, mode), safeWidth, summaryHeight, { title: 'SESSION INDEX', mode }));
  lines.push(...panel(tableLines(model, safeWidth - 2, bodyHeight - summaryHeight - 2, mode), safeWidth, bodyHeight - summaryHeight, { title: tablePanelTitle('SESSIONS', model), mode, active: true }));
}

function renderOperationsView(lines, model, safeWidth, bodyHeight, mode, layout) {
  if (layout === 'narrow') {
    renderTableView(lines, model, safeWidth, bodyHeight, mode);
    return;
  }
  const firstHeight = Math.max(7, Math.min(9, Math.floor(bodyHeight * 0.27)));
  const secondHeight = Math.max(7, Math.min(9, Math.floor(bodyHeight * 0.25)));
  const tableHeight = Math.max(5, bodyHeight - firstHeight - secondHeight);
  const leftWidth = Math.max(34, Math.floor(safeWidth * 0.5));
  const rightWidth = safeWidth - leftWidth - 1;

  const live = panel(liveLines(model, leftWidth - 2, mode), leftWidth, firstHeight, { title: 'LIVE SESSIONS', mode });
  const status = panel(summaryLines(model, mode), rightWidth, firstHeight, { title: 'CONTEXT / EVENTS', mode });
  lines.push(...joinPanels(live, status, leftWidth, firstHeight));

  const tokens = panel(chartLines(model.charts.tokens, leftWidth - 2, fmtNum, mode), leftWidth, secondHeight, { title: 'TOKEN ACTIVITY', mode });
  const preview = panel(selectedPreviewLines(model, mode), rightWidth, secondHeight, { title: 'SELECTED PREVIEW', mode });
  lines.push(...joinPanels(tokens, preview, leftWidth, secondHeight));

  lines.push(...panel(tableLines(model, safeWidth - 2, tableHeight - 2, mode), safeWidth, tableHeight, { title: tablePanelTitle('RECENT / SESSIONS', model), mode, active: true }));
}

function renderChartsView(lines, model, safeWidth, bodyHeight, mode, layout) {
  if (layout === 'narrow') {
    renderTableView(lines, model, safeWidth, bodyHeight, mode);
    return;
  }
  const chartHeight = Math.max(8, Math.min(11, Math.floor(bodyHeight * 0.36)));
  const summaryHeight = Math.max(6, Math.min(8, Math.floor(bodyHeight * 0.22)));
  const tableHeight = Math.max(5, bodyHeight - chartHeight - summaryHeight);
  const gap = 2;
  const chartWidth = Math.floor((safeWidth - gap) / 3);
  const widths = [chartWidth, chartWidth, safeWidth - (chartWidth * 2) - gap];
  const token = panel(chartLines(model.charts.tokens, widths[0] - 2, fmtNum, mode), widths[0], chartHeight, { title: 'TOKEN ACTIVITY', mode });
  const context = panel(chartLines(model.charts.context, widths[1] - 2, fmtPercent, mode), widths[1], chartHeight, { title: 'CONTEXT PRESSURE', mode });
  const tools = panel(chartLines(model.charts.tools, widths[2] - 2, fmtNum, mode), widths[2], chartHeight, { title: 'TOOL ACTIVITY', mode });
  for (let index = 0; index < chartHeight; index += 1) lines.push(`${token[index] ?? ''} ${context[index] ?? ''} ${tools[index] ?? ''}`);

  const leftWidth = Math.max(34, Math.floor(safeWidth * 0.5));
  const rightWidth = safeWidth - leftWidth - 1;
  const live = panel(liveLines(model, leftWidth - 2, mode), leftWidth, summaryHeight, { title: 'LIVE SESSIONS', mode });
  const preview = panel(selectedPreviewLines(model, mode), rightWidth, summaryHeight, { title: 'SELECTED / EVENTS', mode });
  lines.push(...joinPanels(live, preview, leftWidth, summaryHeight));

  lines.push(...panel(tableLines(model, safeWidth - 2, tableHeight - 2, mode), safeWidth, tableHeight, { title: tablePanelTitle('SESSIONS', model), mode, active: true }));
}

export function renderSessionDashboard({
  rows = [],
  width = 120,
  height = 36,
  mode = '256',
  scope = 'all',
  search = '',
  sortBy = 'lastActivity',
  direction = 'desc',
  selectedId = null,
  selectedIndex = 0,
  viewMode = 'operations'
} = {}) {
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const layout = dashboardLayoutMode(safeWidth);
  const resolvedView = resolveManagerViewMode(viewMode, layout);
  const model = buildSessionDashboardModel(rows, { scope, search, sortBy, direction, selectedId, selectedIndex });
  const header = truncateCells(`${hpaint('CODEX // SESSION MANAGER', 'strong', mode)}  ${hpaint(`${model.summary.live} LIVE`, model.summary.live ? 'live' : 'dim', mode)}  ${model.summary.total} LOCAL  ${hpaint(resolvedView.toUpperCase(), 'secondary', mode)}  ${layout.toUpperCase()}`, safeWidth, '');
  const queryLine = truncateCells(`Scope ${model.query.scope.toUpperCase()}  Search ${model.query.search || '--'}  Sort ${model.query.sortBy}:${model.query.direction}  View ${String(viewMode).toUpperCase()}`, safeWidth, '');
  const footerText = safeWidth < 78
    ? '↑↓ select  Enter inspect  / search  V view  Q quit'
    : '↑↓ select  Enter inspect selected  / search  F scope  S sort  D dir  V view  Q/Esc quit';
  const footer = truncateCells(footerText, safeWidth, '');
  const lines = [header, queryLine];
  const bodyHeight = safeHeight - 3;

  if (resolvedView === 'table') renderTableView(lines, model, safeWidth, bodyHeight, mode);
  else if (resolvedView === 'charts') renderChartsView(lines, model, safeWidth, bodyHeight, mode, layout);
  else renderOperationsView(lines, model, safeWidth, bodyHeight, mode, layout);

  lines.push(footer);
  return {
    lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')),
    width: safeWidth,
    height: safeHeight,
    layout,
    viewMode: resolvedView,
    requestedViewMode: viewMode,
    model
  };
}
