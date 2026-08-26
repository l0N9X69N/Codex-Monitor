import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from '../history/theme.js';
import { buildSessionDashboardModel, rowContextPercent } from './dashboard-model.js';

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
  return hpaint(`${left}${truncateCells(label, Math.max(0, width - 2), '')}${dash.repeat(Math.max(0, width - cellWidth(label) - 2))}${right}`, active ? 'nav' : 'panel', mode);
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
    `${hpaint(String(summary.live), 'live', mode)} LIVE   ${summary.ended} ENDED   ${summary.unknown} UNKNOWN   ${summary.total} TOTAL`,
    `Context peak  ${hpaint(pressure, summary.highestContextPercent >= 80 ? 'pressure' : 'text', mode)}`,
    `Events        ${hpaint(String(summary.recentErrors), summary.recentErrors ? 'error' : 'text', mode)} errors   ${summary.recentRetries} retries   ${summary.recentCompactions} compactions`,
    `Storage       ${fmtBytes(summary.storageBytes)} local JSONL`
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
  const columns = fitColumns(tableColumns(width), width - 2);
  const header = columns.map((key) => padCells(COLUMN_SPECS[key].title, COLUMN_SPECS[key].width)).join(' ');
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
    const text = cells.join(' ');
    output.push(index === model.selectedIndex ? hpaint(text, 'nav', mode) : text);
  }
  return output;
}

export function dashboardLayoutMode(width) {
  if (width < 78) return 'narrow';
  if (width < 122) return 'normal';
  if (width < 176) return 'wide';
  return 'ultrawide';
}

function joinPanels(left, right, leftWidth, height) {
  const lines = [];
  for (let index = 0; index < height; index += 1) {
    lines.push(`${left[index] ?? ''.padEnd(leftWidth)} ${right[index] ?? ''}`);
  }
  return lines;
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
  focus = 'table'
} = {}) {
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const layout = dashboardLayoutMode(safeWidth);
  const model = buildSessionDashboardModel(rows, { scope, search, sortBy, direction, selectedId, selectedIndex });
  const header = truncateCells(`${hpaint('CODEX // SESSION MANAGER', 'strong', mode)}  ${hpaint(`${model.summary.live} LIVE`, model.summary.live ? 'live' : 'dim', mode)}  ${model.summary.total} LOCAL  ${hpaint(layout.toUpperCase(), 'secondary', mode)}`, safeWidth, '');
  const queryLine = truncateCells(`Scope ${model.query.scope.toUpperCase()}  Search ${model.query.search || '--'}  Sort ${model.query.sortBy}:${model.query.direction}`, safeWidth, '');
  const footer = truncateCells('↑↓ move  Enter inspect  / search  F scope  S sort  D direction  Tab/←→ panels  Q/Esc back/quit', safeWidth, '');
  const lines = [header, queryLine];
  const bodyHeight = safeHeight - 3;

  if (layout === 'narrow') {
    const summaryHeight = Math.min(6, Math.max(5, Math.floor(bodyHeight * 0.27)));
    const tableHeight = bodyHeight - summaryHeight;
    lines.push(...panel(summaryLines(model, mode), safeWidth, summaryHeight, { title: 'LIVE SESSIONS', mode }));
    lines.push(...panel(tableLines(model, safeWidth - 2, tableHeight - 2, mode), safeWidth, tableHeight, { title: `SESSIONS ${model.rows.length}/${model.summary.total}`, mode, active: focus === 'table' }));
  } else {
    const topHeight = Math.max(10, Math.min(14, Math.floor(bodyHeight * 0.44)));
    const tableHeight = bodyHeight - topHeight;
    if (layout === 'normal') {
      const leftWidth = Math.max(36, Math.floor(safeWidth * 0.42));
      const rightWidth = safeWidth - leftWidth - 1;
      const left = panel(summaryLines(model, mode), leftWidth, topHeight, { title: 'LIVE SESSIONS', mode });
      const right = panel(chartLines(model.charts.context, rightWidth - 2, fmtPercent, mode), rightWidth, topHeight, { title: 'CONTEXT PRESSURE', mode, active: focus === 'context' });
      lines.push(...joinPanels(left, right, leftWidth, topHeight));
    } else {
      const gap = 2;
      const chartWidth = Math.floor((safeWidth - gap) / 3);
      const widths = [chartWidth, chartWidth, safeWidth - (chartWidth * 2) - gap];
      const token = panel(chartLines(model.charts.tokens, widths[0] - 2, fmtNum, mode), widths[0], topHeight, { title: 'TOKEN ACTIVITY', mode, active: focus === 'tokens' });
      const context = panel(chartLines(model.charts.context, widths[1] - 2, fmtPercent, mode), widths[1], topHeight, { title: 'CONTEXT PRESSURE', mode, active: focus === 'context' });
      const tools = panel(chartLines(model.charts.tools, widths[2] - 2, fmtNum, mode), widths[2], topHeight, { title: 'TOOL ACTIVITY', mode, active: focus === 'tools' });
      for (let index = 0; index < topHeight; index += 1) lines.push(`${token[index] ?? ''} ${context[index] ?? ''} ${tools[index] ?? ''}`);
    }
    lines.push(...panel(tableLines(model, safeWidth - 2, tableHeight - 2, mode), safeWidth, tableHeight, { title: `SESSIONS ${model.rows.length}/${model.summary.total}`, mode, active: focus === 'table' }));
  }

  lines.push(footer);
  return {
    lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')),
    width: safeWidth,
    height: safeHeight,
    layout,
    model
  };
}
