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
  const line = `┌${titleText}${'─'.repeat(Math.max(0, width - titleWidth - 2))}┐`;
  return hpaint(line, active ? 'nav' : 'panel', mode);
}

function panel(content, width, height, { title = '', mode = '256', active = false } = {}) {
  if (height <= 0 || width <= 1) return [];
  const inner = Math.max(1, width - 2);
  const result = [border(width, title, mode, active)];
  for (let index = 0; index < Math.max(0, height - 2); index += 1) {
    const body = truncateCells(content[index] ?? '', inner, '');
    const edge = hpaint('│', 'panel', mode);
    result.push(`${edge}${padCells(body, inner)}${edge}`);
  }
  result.push(hpaint(`└${'─'.repeat(inner)}┘`, 'panel', mode));
  return result.slice(0, height);
}

function summaryLines(model, mode) {
  const summary = model.summary;
  const pressure = summary.highestContextPercent == null
    ? '--'
    : `${fmtPercent(summary.highestContextPercent)} ${summary.highestContextLabel ?? ''}`.trim();
  return [
    `${hpaint(String(summary.live), 'live', mode)} ${hpaint('LIVE', 'live', mode)}   ${hpaint(String(summary.ended), 'dim', mode)} ENDED   ${hpaint(String(summary.unknown), 'secondary', mode)} UNKNOWN`,
    `${hpaint('Context peak', 'dim', mode)}  ${hpaint(pressure, summary.highestContextPercent >= 80 ? 'error' : summary.highestContextPercent >= 60 ? 'pressure' : 'live', mode)}`,
    `${hpaint('Events', 'dim', mode)}        ${hpaint(String(summary.recentErrors), summary.recentErrors ? 'error' : 'text', mode)} errors   ${summary.recentRetries} retries   ${summary.recentCompactions} compactions`,
    `${hpaint('Storage', 'dim', mode)}       ${hpaint(fmtBytes(summary.storageBytes), 'session', mode)} local JSONL`
  ];
}

function compactSummaryLines(model, mode) {
  const summary = model.summary;
  const pressure = summary.highestContextPercent == null
    ? '--'
    : `${fmtPercent(summary.highestContextPercent)} ${summary.highestContextLabel ?? ''}`.trim();
  return [
    `${hpaint(String(summary.live), 'live', mode)} LIVE  ${hpaint(String(summary.ended), 'dim', mode)} ENDED  ${hpaint(String(summary.unknown), 'secondary', mode)} UNKNOWN    ${hpaint('CTX', 'dim', mode)} ${hpaint(pressure, summary.highestContextPercent >= 80 ? 'error' : summary.highestContextPercent >= 60 ? 'pressure' : 'live', mode)}`,
    `${hpaint('Events', 'dim', mode)} ${hpaint(String(summary.recentErrors), summary.recentErrors ? 'error' : 'text', mode)} err · ${summary.recentRetries} retry · ${summary.recentCompactions} compact    ${hpaint('Storage', 'dim', mode)} ${hpaint(fmtBytes(summary.storageBytes), 'session', mode)}`
  ];
}

function liveLines(model, width, mode) {
  const live = model.rows.filter((row) => row.state === 'LIVE').slice(0, 6);
  if (!live.length) return [hpaint('No active sessions in current scope.', 'dim', mode)];
  return live.map((row) => {
    const labelWidth = Math.max(8, Math.min(22, Math.floor(width * 0.42)));
    const project = padCells(truncateCells(row.project ?? row.name ?? '--', labelWidth, '…'), labelWidth);
    const context = fmtPercent(rowContextPercent(row)).padStart(5);
    const input = fmtNum(row.tokens?.input).padStart(7);
    const tools = fmtNum(row.toolCount ?? row.observedToolCount).padStart(4);
    return `${hpaint('●', 'live', mode)} ${hpaint(project, 'text', mode)} ${hpaint(context, 'pressure', mode)} ${hpaint(input, 'secondary', mode)} ${hpaint(`${tools}t`, 'live', mode)}`;
  });
}

function selectedPosition(model) {
  if (!model.selected || model.selectedIndex < 0 || !model.rows.length) return 'SELECTED --';
  return `SELECTED ${model.selectedIndex + 1}/${model.rows.length}`;
}

function selectedPreviewLines(model, mode) {
  const row = model.selected;
  if (!row) return [hpaint('No session selected.', 'dim', mode)];
  const state = hpaint(row.state ?? 'UNKNOWN', stateToken(row.state), mode);
  const identity = row.threadId ?? row.name ?? '--';
  return [
    `${hpaint('▸', 'nav', mode)} ${hpaint(`${model.selectedIndex + 1}/${model.rows.length}`, 'session', mode)}  ${hpaint(row.project ?? row.name ?? '--', 'text', mode)} · ${state}`,
    `${hpaint('Session', 'dim', mode)}    ${hpaint(truncateCells(identity, 30, '…'), 'session', mode)}`,
    `${hpaint('Model', 'dim', mode)}      ${hpaint(row.model ?? '--', 'secondary', mode)}`,
    `${hpaint('Context', 'dim', mode)}    ${hpaint(fmtPercent(rowContextPercent(row)), 'pressure', mode)}    ${hpaint('Input', 'dim', mode)} ${hpaint(fmtNum(row.tokens?.input), 'secondary', mode)}`,
    `${hpaint('Turns', 'dim', mode)}      ${hpaint(fmtNum(row.turnCount ?? row.observedTurnCount), 'text', mode)}    ${hpaint('Tools', 'dim', mode)} ${hpaint(fmtNum(row.toolCount ?? row.observedToolCount), 'live', mode)}`,
    `${hpaint('Size', 'dim', mode)}       ${hpaint(fmtBytes(row.fileSizeBytes), 'text', mode)}`,
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
    return `${hpaint(label, item.state === 'LIVE' ? 'live' : 'session', mode)} ${hpaint('▕', 'dim', mode)}${hpaint(active, token, mode)}${hpaint(track, 'dim', mode)}${hpaint('▏', 'dim', mode)} ${hpaint(value, token, mode)}`;
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
    output.push(hpaint('No sessions match current query.', 'dim', mode));
    return output;
  }
  const visible = Math.max(1, rows - 1);
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
      else if (!isSelected && key === 'model') value = hpaint(raw, 'dim', mode);
      else if (!isSelected && key === 'context') {
        const pct = rowContextPercent(row);
        value = hpaint(raw, pct >= 80 ? 'error' : pct >= 60 ? 'pressure' : pct != null ? 'live' : 'dim', mode);
      }
      return padCells(value, spec.width);
    });
    const marker = isSelected ? '▸' : ' ';
    const text = `${marker} ${cells.join(' ')}`;
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
  const summaryHeight = 4;
  lines.push(...panel(compactSummaryLines(model, mode), safeWidth, summaryHeight, { title: 'SESSION INDEX', mode }));
  lines.push(...panel(tableLines(model, safeWidth - 2, bodyHeight - summaryHeight - 2, mode), safeWidth, bodyHeight - summaryHeight, { title: tablePanelTitle('SESSIONS', model), mode, active: true }));
}

function renderOperationsView(lines, model, safeWidth, bodyHeight, mode, layout) {
  if (layout === 'narrow') {
    renderTableView(lines, model, safeWidth, bodyHeight, mode);
    return;
  }
  const currentHeight = Math.max(7, Math.min(8, Math.floor(bodyHeight * 0.25)));
  const activityHeight = Math.max(7, Math.min(9, Math.floor(bodyHeight * 0.27)));
  const tableHeight = Math.max(5, bodyHeight - currentHeight - activityHeight);
  const leftWidth = Math.max(34, Math.floor(safeWidth * 0.5));
  const rightWidth = safeWidth - leftWidth - 1;

  const current = panel(liveLines(model, leftWidth - 2, mode), leftWidth, currentHeight, { title: 'CURRENT / LIVE', mode });
  const status = panel(summaryLines(model, mode), rightWidth, currentHeight, { title: 'STATUS / EVENTS', mode });
  lines.push(...joinPanels(current, status, leftWidth, currentHeight));

  const tokens = panel(chartLines(model.charts.tokens, leftWidth - 2, fmtNum, mode, 'secondary'), leftWidth, activityHeight, { title: 'TOKEN RANKING', mode });
  const preview = panel(selectedPreviewLines(model, mode), rightWidth, activityHeight, { title: 'SELECTED SESSION', mode, active: true });
  lines.push(...joinPanels(tokens, preview, leftWidth, activityHeight));

  lines.push(...panel(tableLines(model, safeWidth - 2, tableHeight - 2, mode), safeWidth, tableHeight, { title: tablePanelTitle('RECENT SESSIONS', model), mode }));
}

function renderChartsView(lines, model, safeWidth, bodyHeight, mode, layout) {
  if (layout === 'narrow') {
    renderTableView(lines, model, safeWidth, bodyHeight, mode);
    return;
  }
  const chartHeight = Math.max(9, Math.min(12, Math.floor(bodyHeight * 0.43)));
  const detailHeight = Math.max(7, Math.min(9, Math.floor(bodyHeight * 0.28)));
  const recentHeight = Math.max(5, bodyHeight - chartHeight - detailHeight);
  const gap = 2;
  const chartWidth = Math.floor((safeWidth - gap) / 3);
  const widths = [chartWidth, chartWidth, safeWidth - (chartWidth * 2) - gap];
  const token = panel(chartLines(model.charts.tokens, widths[0] - 2, fmtNum, mode, 'secondary'), widths[0], chartHeight, { title: 'TOKEN ACTIVITY', mode });
  const context = panel(chartLines(model.charts.context, widths[1] - 2, fmtPercent, mode, 'pressure'), widths[1], chartHeight, { title: 'CONTEXT PRESSURE', mode });
  const tools = panel(chartLines(model.charts.tools, widths[2] - 2, fmtNum, mode, 'live'), widths[2], chartHeight, { title: 'TOOL ACTIVITY', mode });
  for (let index = 0; index < chartHeight; index += 1) lines.push(`${token[index] ?? ''} ${context[index] ?? ''} ${tools[index] ?? ''}`);

  const leftWidth = Math.max(34, Math.floor(safeWidth * 0.45));
  const rightWidth = safeWidth - leftWidth - 1;
  const status = panel(summaryLines(model, mode), leftWidth, detailHeight, { title: 'SCOPE SUMMARY', mode });
  const preview = panel(selectedPreviewLines(model, mode), rightWidth, detailHeight, { title: 'SELECTED SESSION', mode, active: true });
  lines.push(...joinPanels(status, preview, leftWidth, detailHeight));

  lines.push(...panel(tableLines(model, safeWidth - 2, Math.min(recentHeight - 2, 5), mode), safeWidth, recentHeight, { title: tablePanelTitle('RECENT', model), mode }));
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
  const header = truncateCells(`${hpaint('CODEX // SESSION MANAGER', 'strong', mode)}  ${hpaint(`${model.summary.live} LIVE`, model.summary.live ? 'live' : 'dim', mode)}  ${hpaint(`${model.summary.total} LOCAL`, 'text', mode)}  ${hpaint(resolvedView.toUpperCase(), 'session', mode)}  ${hpaint(layout.toUpperCase(), 'dim', mode)}`, safeWidth, '');
  const queryLine = truncateCells(`${hpaint('Scope', 'dim', mode)} ${hpaint(model.query.scope.toUpperCase(), 'nav', mode)}  ${hpaint('Search', 'dim', mode)} ${model.query.search || '--'}  ${hpaint('Sort', 'dim', mode)} ${hpaint(`${model.query.sortBy}:${model.query.direction}`, 'session', mode)}  ${hpaint('View', 'dim', mode)} ${hpaint(String(viewMode).toUpperCase(), 'secondary', mode)}`, safeWidth, '');
  const footerText = safeWidth < 78
    ? '↑↓ select  Enter inspect  / search  V view  Q quit'
    : '↑↓ select  Enter inspect  / search  F scope  S sort  D dir  V view  Q/Esc quit';
  const footer = truncateCells(hpaint(footerText, 'dim', mode), safeWidth, '');
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
