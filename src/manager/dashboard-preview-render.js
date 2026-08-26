import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from '../history/theme.js';
import { rowContextPercent } from './dashboard-model.js';
import { renderSessionDashboard } from './dashboard-render.js';
import { selectedActivityPreviewLines } from './activity-preview-render.js';

function finiteOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function fmtDuration(ms) {
  const n = finiteOrNull(ms);
  if (n == null || n < 0) return '--';
  const seconds = Math.floor(n / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)}d${hours % 24}h`;
}

function fmtTurnaround(ms) {
  const n = finiteOrNull(ms);
  if (n == null || n < 0) return '--';
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}s`;
  if (n < 60_000) return `${Math.round(n / 1000)}s`;
  return fmtDuration(n);
}

function fmtPercent(value) {
  const n = finiteOrNull(value);
  return n == null ? '--' : `${Math.round(n)}%`;
}

function fmtEffort(value) {
  const text = String(value ?? '').trim();
  return text ? text.toUpperCase() : '--';
}

function effortToken(value) {
  const effort = String(value ?? '').trim().toLowerCase();
  if (['xhigh', 'extra-high', 'extra_high', 'max'].includes(effort)) return 'error';
  if (effort === 'high') return 'pressure';
  if (effort === 'medium') return 'session';
  if (effort === 'low' || effort === 'minimal') return 'dim';
  return 'secondary';
}

function fmtAge(atMs, nowMs = Date.now()) {
  const at = finiteOrNull(atMs);
  if (at == null) return '--';
  const delta = Math.max(0, nowMs - at);
  if (delta < 1000) return 'now';
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}

function stateToken(state) {
  if (state === 'LIVE') return 'live';
  if (state === 'ENDED') return 'dim';
  return 'secondary';
}

function shortSessionId(row) {
  const raw = String(row?.threadId ?? row?.name ?? '');
  if (!raw) return '--';
  if (raw.length <= 8) return raw;
  const compact = raw.replace(/[^a-zA-Z0-9]/g, '');
  return (compact || raw).slice(-8);
}

function border(width, title, mode, active = false) {
  const label = title ? ` ${title} ` : '';
  const titleText = truncateCells(label, Math.max(0, width - 2), '');
  const titleWidth = Math.min(cellWidth(titleText), Math.max(0, width - 2));
  return `${hpaint('┌', active ? 'nav' : 'panel', mode)}${hpaint(titleText, active ? 'nav' : 'heading', mode)}${hpaint('─'.repeat(Math.max(0, width - titleWidth - 2)), active ? 'nav' : 'panel', mode)}${hpaint('┐', active ? 'nav' : 'panel', mode)}`;
}

function panel(content, width, height, { title = '', mode = '256', active = false } = {}) {
  if (height <= 0 || width <= 1) return [];
  const inner = Math.max(1, width - 2);
  const lines = [border(width, title, mode, active)];
  for (let index = 0; index < Math.max(0, height - 2); index += 1) {
    const body = truncateCells(content[index] ?? '', inner, '');
    const edge = hpaint('│', active ? 'nav' : 'panel', mode);
    lines.push(`${edge}${padCells(body, inner)}${edge}`);
  }
  lines.push(hpaint(`└${'─'.repeat(inner)}┘`, active ? 'nav' : 'panel', mode));
  return lines.slice(0, height);
}

function joinPanels(left, right, leftWidth, height) {
  const lines = [];
  for (let index = 0; index < height; index += 1) {
    lines.push(`${left[index] ?? ''.padEnd(leftWidth)} ${right[index] ?? ''}`);
  }
  return lines;
}

const PREVIEW_COLUMNS = Object.freeze([
  { key: 'state', title: 'STATE', width: 8, value: (row) => row.state ?? 'UNKNOWN' },
  { key: 'project', title: 'PROJECT', width: 18, value: (row) => row.project ?? 'UNKNOWN' },
  { key: 'session', title: 'SESSION', width: 10, value: (row) => shortSessionId(row) },
  { key: 'model', title: 'MODEL', width: 14, value: (row) => row.model ?? '--' },
  { key: 'effort', title: 'EFFORT', width: 8, value: (row) => fmtEffort(row.reasoning) },
  { key: 'active', title: 'ACTIVE', width: 7, value: (row) => fmtAge(row.lastActivityAtMs ?? row.modifiedAtMs) },
  { key: 'context', title: 'CTX', width: 6, value: (row) => fmtPercent(rowContextPercent(row)) },
  { key: 'input', title: 'INPUT', width: 8, value: (row) => fmtNum(row.tokens?.input) },
  { key: 'output', title: 'OUTPUT', width: 8, value: (row) => fmtNum(row.tokens?.output) },
  { key: 'reason', title: 'REASON', width: 8, value: (row) => fmtNum(row.tokens?.reasoning) },
  { key: 'turn', title: 'TURN', width: 5, value: (row) => fmtNum(row.turnCount ?? row.observedTurnCount) },
  { key: 'turnaround', title: 'LAST TURN', width: 10, value: (row) => fmtTurnaround(row.lastTurnDurationMs) },
  { key: 'tools', title: 'TOOLS', width: 6, value: (row) => fmtNum(row.toolCount ?? row.observedToolCount) },
  { key: 'agents', title: 'AGENTS', width: 7, value: (row) => fmtNum(row.agentSpawnCount ?? row.observedAgentSpawnCount ?? 0) },
  { key: 'size', title: 'SIZE', width: 8, value: (row) => fmtBytes(row.fileSizeBytes) }
]);

function tableWidth(columns) {
  return columns.reduce((sum, column) => sum + column.width, 0) + Math.max(0, columns.length - 1) + 2;
}

function previewTableColumns(width) {
  const columns = [...PREVIEW_COLUMNS];
  const removableOrder = ['effort', 'reason', 'agents', 'output', 'active', 'size', 'turn', 'tools', 'turnaround'];
  while (columns.length > 4 && tableWidth(columns) > width) {
    const key = removableOrder.find((candidate) => columns.some((column) => column.key === candidate));
    const index = columns.findIndex((column) => column.key === key);
    if (index < 0) break;
    columns.splice(index, 1);
  }
  return columns;
}

function previewTableLines(model, width, rows, mode) {
  const columns = previewTableColumns(width);
  const widths = Object.fromEntries(columns.map((column) => [column.key, column.width]));
  let extra = Math.max(0, width - tableWidth(columns));
  const elasticOrder = ['project', 'model', 'session'];
  const caps = { project: 28, model: 22, session: 14 };
  while (extra > 0) {
    let changed = false;
    for (const key of elasticOrder) {
      if (extra <= 0 || !columns.some((column) => column.key === key)) continue;
      if (widths[key] >= caps[key]) continue;
      widths[key] += 1;
      extra -= 1;
      changed = true;
    }
    if (!changed) break;
  }

  const lines = [hpaint(`  ${columns.map((column) => padCells(column.title, widths[column.key])).join(' ')}`, 'label', mode)];
  if (!model.rows.length) return [...lines, hpaint('No sessions match current query.', 'dim', mode)];

  const visible = Math.max(1, rows - 1);
  const selected = Math.max(0, model.selectedIndex);
  const start = Math.max(0, Math.min(selected - Math.floor(visible / 2), Math.max(0, model.rows.length - visible)));
  for (let index = start; index < Math.min(model.rows.length, start + visible); index += 1) {
    const row = model.rows[index];
    const isSelected = index === model.selectedIndex;
    const cells = columns.map((column) => {
      const raw = truncateCells(column.value(row), widths[column.key], '…');
      let value = raw;
      if (!isSelected && column.key === 'state') value = hpaint(raw, stateToken(row.state), mode);
      else if (!isSelected && column.key === 'project') value = hpaint(raw, 'text', mode);
      else if (!isSelected && column.key === 'session') value = hpaint(raw, 'session', mode);
      else if (!isSelected && column.key === 'model') value = hpaint(raw, 'dim', mode);
      else if (!isSelected && column.key === 'effort') value = hpaint(raw, effortToken(row.reasoning), mode);
      else if (!isSelected && column.key === 'active') value = hpaint(raw, row.state === 'LIVE' ? 'live' : 'dim', mode);
      else if (!isSelected && column.key === 'context') {
        const pct = rowContextPercent(row);
        value = hpaint(raw, pct >= 80 ? 'error' : pct >= 60 ? 'pressure' : pct != null ? 'live' : 'dim', mode);
      } else if (!isSelected && (column.key === 'output' || column.key === 'reason')) value = hpaint(raw, 'secondary', mode);
      else if (!isSelected && column.key === 'turnaround') value = hpaint(raw, 'pressure', mode);
      else if (!isSelected && column.key === 'agents') value = hpaint(raw, Number(row.agentSpawnCount ?? row.observedAgentSpawnCount ?? 0) > 0 ? 'nav' : 'dim', mode);
      return padCells(value, widths[column.key]);
    });
    const text = `${isSelected ? '▸' : ' '} ${cells.join(' ')}`;
    lines.push(isSelected ? hpaint(text, 'selected', mode) : text);
  }
  return lines;
}

function recentBlockGeometry(frame, height, telemetry) {
  const safeHeight = Math.max(16, Number(height) || 36);
  const bodyHeight = safeHeight - 3;
  if (frame.viewMode === 'table') {
    const summaryHeight = 4;
    return { start: 2 + summaryHeight, height: bodyHeight - summaryHeight };
  }
  if (frame.viewMode === 'operations') {
    const blockHeight = Math.max(5, bodyHeight - 7 - 11);
    return { start: 2 + 7 + 11, height: blockHeight };
  }
  if (frame.viewMode === 'charts') {
    const aggregateHeight = 11;
    const liveCount = Array.isArray(telemetry?.sessions) ? telemetry.sessions.length : 0;
    const maxLiveRows = Math.max(1, Math.min(liveCount || 1, Math.max(1, Math.floor(bodyHeight * 0.28) - 3)));
    const liveHeight = Math.max(4, maxLiveRows + 3);
    const rankingHeight = 7;
    const recentHeight = Math.max(5, bodyHeight - aggregateHeight - liveHeight - rankingHeight);
    return { start: 2 + aggregateHeight + liveHeight + rankingHeight, height: recentHeight };
  }
  return null;
}

function previewTitle(preview, model) {
  const row = model.selected;
  const project = preview?.project ?? row?.project ?? 'UNKNOWN';
  const id = row ? shortSessionId(row) : '--';
  return `SELECTED ACTIVITY · ${project} · ${id}`;
}

export function renderSessionDashboardWithPreview(options = {}) {
  const frame = renderSessionDashboard(options);
  const width = Math.max(44, Number(options.width) || 120);
  const height = Math.max(16, Number(options.height) || 36);
  const preview = options.activityPreview ?? null;
  if (width < 220 || frame.layout !== 'ultrawide' || !preview) return frame;

  const geometry = recentBlockGeometry(frame, height, options.telemetry);
  if (!geometry || geometry.height < 6) return frame;

  const leftWidth = Math.max(118, Math.min(Math.floor(width * 0.62), 158));
  const rightWidth = width - leftWidth - 1;
  if (rightWidth < 48) return frame;

  const tableLines = previewTableLines(frame.model, leftWidth - 2, geometry.height - 2, options.mode ?? '256');
  const activityLines = selectedActivityPreviewLines(preview, rightWidth - 2, geometry.height - 2, options.mode ?? '256');
  const tablePrefix = frame.viewMode === 'table'
    ? 'SESSIONS'
    : frame.viewMode === 'charts' ? 'RECENT / SELECT' : 'RECENT SESSIONS';
  const replacement = joinPanels(
    panel(tableLines, leftWidth, geometry.height, {
      title: `${tablePrefix} ${frame.model.rows.length}/${frame.model.summary.total}  SELECTED ${frame.model.selectedIndex + 1}/${frame.model.rows.length}`,
      mode: options.mode ?? '256'
    }),
    panel(activityLines, rightWidth, geometry.height, {
      title: previewTitle(preview, frame.model),
      mode: options.mode ?? '256',
      active: true
    }),
    leftWidth,
    geometry.height
  );

  const footer = frame.lines.at(-1);
  const prefix = frame.lines.slice(0, geometry.start);
  frame.lines = [...prefix, ...replacement, footer].slice(0, height);
  return frame;
}
