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
    `${hpaint('Agents', 'label', mode)}     ${hpaint(fmtNum(row.agentSpawnCount ?? row.observedAgentSpawnCount ?? 0), 'nav', mode)} spawned`,
    `${hpaint('Enter', 'nav', mode)}      inspect selected session`
  ];
}
function chartLines(items, width, formatter, mode, token = 'nav') {
  if (!items.length) return [hpaint('No evidenced data in current scope.', 'dim', mode)];
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  const labelWidth = Math.max(10, Math.min(26, Math.floor(width * 0.3)));
  const valueWidth = 8;
  const barWidth = Math.max(8, width - labelWidth - valueWidth - 5);
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
function sumKnown(values) {
  const known = values.filter((value) => Number.isFinite(value));
  return known.reduce((sum, value) => sum + value, 0);
}
function rollingSum(values, count) {
  return sumKnown(values.slice(-Math.max(1, count)));
}
function maxKnown(values, fallback = 1) {
  const known = values.filter(Number.isFinite);
  return known.length ? Math.max(...known, fallback) : fallback;
}
function timeRange(samples, windowMs = 60_000) {
  const times = (Array.isArray(samples) ? samples : [])
    .map((sample) => Number(sample?.atMs))
    .filter(Number.isFinite);
  const latest = times.length ? Math.max(...times) : null;
  return latest == null ? null : { start: latest - windowMs, end: latest, windowMs };
}
function xForTime(atMs, range, pixelWidth) {
  if (!range || pixelWidth <= 1) return pixelWidth - 1;
  const ratio = (Number(atMs) - range.start) / range.windowMs;
  return Math.max(0, Math.min(pixelWidth - 1, Math.round(ratio * (pixelWidth - 1))));
}
function fallbackX(index, length, pixelWidth) {
  if (length <= 1 || pixelWidth <= 1) return pixelWidth - 1;
  return Math.round((index / (length - 1)) * (pixelWidth - 1));
}
function drawLine(canvas, x0, y0, x1, y1) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    if (canvas[y]?.[x] != null) canvas[y][x] = true;
    if (x === x1 && y === y1) break;
    const doubled = 2 * error;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
}
const BRAILLE_BITS = Object.freeze([[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]);
function brailleLine(samples, key, width, rows, mode, token, fixedMax = null, valueTransform = null) {
  const charWidth = Math.max(8, width);
  const charRows = Math.max(1, rows);
  const pixelWidth = charWidth * 2;
  const pixelHeight = charRows * 4;
  const canvas = Array.from({ length: pixelHeight }, () => Array(pixelWidth).fill(false));
  const list = Array.isArray(samples) ? samples : [];
  const rawValues = valuesFrom(list, key);
  const values = valueTransform ? valueTransform(rawValues) : rawValues;
  const scaleMax = fixedMax ?? maxKnown(values, 1);
  const range = timeRange(list);
  const points = [];
  for (let index = 0; index < list.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) continue;
    const x = Number.isFinite(Number(list[index]?.atMs)) ? xForTime(list[index].atMs, range, pixelWidth) : fallbackX(index, list.length, pixelWidth);
    const ratio = Math.max(0, Math.min(1, value / Math.max(1, scaleMax)));
    const y = (pixelHeight - 1) - Math.round(ratio * (pixelHeight - 1));
    points.push([x, y]);
  }
  for (let index = 0; index < points.length; index += 1) {
    const [x, y] = points[index];
    canvas[y][x] = true;
    if (index > 0) drawLine(canvas, points[index - 1][0], points[index - 1][1], x, y);
  }
  const output = [];
  for (let row = 0; row < charRows; row += 1) {
    let text = '';
    for (let column = 0; column < charWidth; column += 1) {
      let bits = 0;
      for (let py = 0; py < 4; py += 1) for (let px = 0; px < 2; px += 1) if (canvas[row * 4 + py][column * 2 + px]) bits |= BRAILLE_BITS[py][px];
      text += bits ? String.fromCharCode(0x2800 + bits) : ' ';
    }
    output.push(hpaint(text, token, mode));
  }
  return output;
}
function rollingWindowValues(values, window = 5) {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    return sumKnown(values.slice(start, index + 1));
  });
}
function timeAxis(width, mode) {
  const usable = Math.max(12, width - 9);
  return `${hpaint('−60s', 'dim', mode)}${hpaint('┈'.repeat(usable), 'grid', mode)}${hpaint('now', 'dim', mode)}`;
}
function aggregateTelemetryLines(telemetry, width, mode) {
  const samples = telemetry?.samples ?? [];
  const tokenValues = valuesFrom(samples, 'tokenRate');
  const toolEvents = valuesFrom(samples, 'toolEvents').map((value) => Number.isFinite(value) ? value : 0);
  const turnEvents = valuesFrom(samples, 'turnEvents').map((value) => Number.isFinite(value) ? value : 0);
  const tokenNow = latestKnown(tokenValues);
  const graphWidth = Math.max(18, width - 2);
  const tokenGraph = brailleLine(samples, 'tokenRate', graphWidth, 2, mode, 'secondary');
  const toolLoad = rollingWindowValues(toolEvents, 5);
  const toolGraph = brailleLine(samples, 'toolEvents', graphWidth, 1, mode, 'live', null, () => toolLoad);
  const turnLoad = rollingWindowValues(turnEvents, 5);
  const turnGraph = brailleLine(samples, 'turnEvents', graphWidth, 1, mode, 'pressure', null, () => turnLoad);
  const toolNow5 = rollingSum(toolEvents, 5);
  const turnNow5 = rollingSum(turnEvents, 5);
  return [
    `${hpaint('LIVE FEED', 'label', mode)}  ${hpaint(String(telemetry?.latest?.activeCount ?? 0), 'live', mode)} active   ${hpaint('window 60s', 'dim', mode)}   ${hpaint(`samples ${telemetry?.sampleCount ?? 0}`, 'dim', mode)}`,
    `${hpaint('TOKEN BURN', 'heading', mode)}  ${hpaint(`${fmtNum(tokenNow)}/min`, 'secondary', mode)}  ${hpaint(`${fmtNum(telemetry?.burn60 ?? 0)} tok/60s`, 'session', mode)}  ${hpaint(`peak ${fmtNum(maxKnown(tokenValues, 0))}/m`, 'dim', mode)}`,
    ...tokenGraph,
    `${hpaint('TOOL LOAD', 'heading', mode)}  ${hpaint(`${toolNow5} evt/5s`, 'live', mode)}  ${hpaint(`${fmtNum(telemetry?.tools60 ?? 0)} evt/60s`, 'dim', mode)}`,
    ...toolGraph,
    `${hpaint('TURN LOAD', 'heading', mode)}  ${hpaint(`${turnNow5} turn/5s`, 'pressure', mode)}  ${hpaint(`${fmtNum(telemetry?.turns60 ?? 0)} turn/60s`, 'dim', mode)}`,
    ...turnGraph,
    timeAxis(graphWidth, mode)
  ];
}
function liveTelemetryRows(telemetry, width, mode, limit = 6) {
  const sessions = Array.isArray(telemetry?.sessions) ? telemetry.sessions.slice(0, limit) : [];
  if (!sessions.length) return [hpaint('No LIVE session telemetry yet.', 'dim', mode)];
  const nameWidth = Math.max(10, Math.min(18, Math.floor(width * 0.14)));
  const fixedWidth = 2 + nameWidth + 1 + 8 + 1 + 8 + 1 + 6 + 1 + 4 + 1 + 6 + 1 + 6;
  const graphWidth = Math.max(12, width - fixedWidth);
  const rows = [
    `${padCells(hpaint('PROJECT', 'label', mode), nameWidth + 2)} ${padCells(hpaint('SESSION', 'label', mode), 8)} ${padCells(hpaint('TOKEN 60s', 'label', mode), graphWidth)} ${padCells(hpaint('BURN60', 'label', mode), 8)} ${padCells(hpaint('SHARE', 'label', mode), 6)} ${padCells(hpaint('CTX', 'label', mode), 4)} ${padCells(hpaint('TOOL5', 'label', mode), 6)} ${hpaint('AGENTS', 'label', mode)}`
  ];
  for (const session of sessions) {
    const tokenGraph = brailleLine(session.samples, 'tokenRate', graphWidth, 1, mode, 'secondary')[0];
    const toolEvents = valuesFrom(session.samples, 'toolEvents').map((value) => Number.isFinite(value) ? value : 0);
    const toolNow5 = rollingSum(toolEvents, 5);
    const ctx = session.context;
    const name = padCells(truncateCells(session.project ?? 'session', nameWidth, '…'), nameWidth);
    const id = padCells(shortSessionId(session), 8);
    const burn = `${fmtNum(session.burn60 ?? 0)}t`.padStart(8);
    const share = fmtPercent(session.burnShare ?? 0).padStart(6);
    const context = fmtPercent(ctx).padStart(4);
    const agents = String(Math.round(Number(session.agentSpawns) || 0)).padStart(6);
    rows.push(`${hpaint('●', 'live', mode)} ${hpaint(name, 'text', mode)} ${hpaint(id, 'session', mode)} ${tokenGraph} ${hpaint(burn, 'secondary', mode)} ${hpaint(share, Number(session.burnShare) >= 50 ? 'pressure' : 'text', mode)} ${hpaint(context, Number(ctx) >= 80 ? 'error' : Number(ctx) >= 60 ? 'pressure' : 'live', mode)} ${hpaint(String(toolNow5).padStart(6), 'live', mode)} ${hpaint(agents, Number(session.agentSpawns) > 0 ? 'nav' : 'dim', mode)}`);
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
function tableLines(model, width, rows, mode) {
  const markerWidth = 2;
  const columns = fitColumns(tableColumns(width), width - markerWidth);
  const output = [hpaint(`${' '.repeat(markerWidth)}${columns.map((key) => padCells(COLUMN_SPECS[key].title, COLUMN_SPECS[key].width)).join(' ')}`, 'label', mode)];
  if (!model.rows.length) return [...output, hpaint('No sessions match current query.', 'dim', mode)];
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
  const middleHeight = 11;
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
  lines.push(...panel(tableLines(model, width - 2, tableHeight - 2, mode), width, tableHeight, { title: tablePanelTitle('RECENT SESSIONS', model), mode }));
}
function renderChartsView(lines, model, width, bodyHeight, mode, layout, telemetry) {
  if (layout === 'narrow') return renderTableView(lines, model, width, bodyHeight, mode);
  const aggregateHeight = 11;
  const liveCount = Array.isArray(telemetry?.sessions) ? telemetry.sessions.length : 0;
  const maxLiveRows = Math.max(1, Math.min(liveCount || 1, Math.max(1, Math.floor(bodyHeight * 0.28) - 3)));
  const liveHeight = Math.max(4, maxLiveRows + 3);
  const rankingHeight = 7;
  const recentHeight = Math.max(5, bodyHeight - aggregateHeight - liveHeight - rankingHeight);
  lines.push(...panel(aggregateTelemetryLines(telemetry, width - 4, mode), width, aggregateHeight, { title: 'SYSTEM MOTION · LIVE ONLY · ROLLING 60s', mode }));
  lines.push(...panel(liveTelemetryRows(telemetry, width - 4, mode, maxLiveRows), width, liveHeight, { title: 'LIVE SESSIONS · BURN / SHARE / CONTEXT / TOOLS / AGENTS', mode }));
  const leftWidth = Math.max(34, Math.floor(width * 0.5));
  const rightWidth = width - leftWidth - 1;
  lines.push(...joinPanels(
    panel(chartLines(model.charts.tokens, leftWidth - 2, fmtNum, mode, 'secondary').slice(0, Math.max(1, rankingHeight - 2)), leftWidth, rankingHeight, { title: 'TOP TOKEN TOTAL · current scope', mode }),
    panel(chartLines(model.charts.context, rightWidth - 2, fmtPercent, mode, 'pressure').slice(0, Math.max(1, rankingHeight - 2)), rightWidth, rankingHeight, { title: 'TOP CONTEXT · current scope', mode }),
    leftWidth,
    rankingHeight
  ));
  lines.push(...panel(tableLines(model, width - 2, recentHeight - 2, mode), width, recentHeight, { title: tablePanelTitle('RECENT / SELECT', model), mode }));
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
