import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from '../history/theme.js';

function finiteOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fmtBytes(value) {
  const n = finiteOrNull(value);
  if (n == null) return '--';
  if (n >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(1)}G`;
  if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(1)}M`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${Math.round(n)}B`;
}

function shortId(row) {
  const raw = String(row?.threadId ?? row?.name ?? row?.id ?? '');
  const compact = raw.replace(/[^a-zA-Z0-9]/g, '');
  return (compact || raw).slice(-8) || '--';
}

function panel(content, width, height, { title = '', mode = '256', active = false } = {}) {
  if (height <= 0 || width <= 1) return [];
  const inner = Math.max(1, width - 2);
  const label = title ? ` ${title} ` : '';
  const titleText = truncateCells(label, inner, '');
  const titleWidth = cellWidth(titleText);
  const edgeToken = active ? 'nav' : 'panel';
  const edge = (char) => hpaint(char, edgeToken, mode);
  const lines = [`${edge('┌')}${hpaint(titleText, active ? 'nav' : 'heading', mode)}${edge('─'.repeat(Math.max(0, inner - titleWidth)))}${edge('┐')}`];
  for (let index = 0; index < Math.max(0, height - 2); index += 1) {
    const body = truncateCells(content[index] ?? '', inner, '');
    lines.push(`${edge('│')}${padCells(body, inner)}${edge('│')}`);
  }
  lines.push(`${edge('└')}${edge('─'.repeat(inner))}${edge('┘')}`);
  return lines.slice(0, height);
}

function joinPanels(left, right, leftWidth, height) {
  return Array.from({ length: height }, (_, index) => `${left[index] ?? ''.padEnd(leftWidth)} ${right[index] ?? ''}`);
}

function summaryLines(summary, selectedSummary, mode) {
  return [
    `${hpaint('Sessions', 'label', mode)}   ${summary.count} total   ${hpaint(String(summary.live), 'live', mode)} LIVE   ${summary.ended} ENDED   ${hpaint(String(summary.unknown), 'secondary', mode)} UNKNOWN`,
    `${hpaint('Storage', 'label', mode)}    ${hpaint(fmtBytes(summary.totalBytes), 'session', mode)} known   ${summary.unknownSizeCount} unknown-size`,
    `${hpaint('Clearable', 'label', mode)}  ${summary.eligibleDeleteCount} ENDED`,
    `${hpaint('Selected', 'label', mode)}   ${hpaint(String(selectedSummary.count), selectedSummary.count ? 'nav' : 'dim', mode)} sessions   ${hpaint(fmtBytes(selectedSummary.sizeBytes), selectedSummary.count ? 'pressure' : 'dim', mode)}`
  ];
}

function projectLines(summary, mode) {
  if (!summary.byProject.length) return [hpaint('No project storage evidence.', 'dim', mode)];
  return summary.byProject.map((item) => `${padCells(truncateCells(item.label, 24, '…'), 24)} ${String(item.count).padStart(5)}  ${hpaint(fmtBytes(item.sizeBytes).padStart(9), 'session', mode)}`);
}

function ageLines(summary, mode) {
  return summary.byAge.map((item) => `${padCells(item.label, 10)} ${String(item.count).padStart(5)}  ${hpaint(fmtBytes(item.sizeBytes).padStart(9), 'secondary', mode)}`);
}

function largestLines(summary, selectedIds, mode) {
  if (!summary.largest.length) return [hpaint('No sized sessions.', 'dim', mode)];
  return summary.largest.map((row) => {
    const selected = selectedIds.has(row.id);
    const marker = row.state === 'ENDED' ? (selected ? '[x]' : '[ ]') : '[-]';
    const token = row.state === 'LIVE' ? 'live' : row.state === 'ENDED' ? 'text' : 'secondary';
    return `${hpaint(marker, selected ? 'nav' : token, mode)} ${padCells(truncateCells(row.project, 24, '…'), 24)} ${hpaint(shortId(row), 'session', mode)} ${padCells(row.state, 7)} ${hpaint(fmtBytes(row.sizeBytes).padStart(9), 'secondary', mode)}`;
  });
}

export function renderStorageManager({
  summary,
  selectedSummary,
  selectedIds = new Set(),
  width = 120,
  height = 36,
  mode = '256',
  status = ''
} = {}) {
  const safeWidth = Math.max(60, Number(width) || 120);
  const safeHeight = Math.max(18, Number(height) || 36);
  const header = truncateCells(`${hpaint('CODEX // STORAGE MANAGER', 'strong', mode)}  ${hpaint(fmtBytes(summary?.totalBytes), 'session', mode)}  ${summary?.count ?? 0} sessions`, safeWidth, '');
  const help = truncateCells(hpaint('M back  Space select  A all-ended  N none  I invert  C clear selected', 'dim', mode), safeWidth, '');
  const footer = truncateCells(status ? hpaint(status, 'pressure', mode) : hpaint('LIVE/UNKNOWN are protected; clear is revalidated immediately before unlink.', 'dim', mode), safeWidth, '');
  const bodyHeight = safeHeight - 3;
  const topHeight = Math.min(7, Math.max(6, Math.floor(bodyHeight * 0.22)));
  const lowerHeight = Math.max(6, bodyHeight - topHeight);
  const leftWidth = Math.max(36, Math.floor(safeWidth * 0.58));
  const rightWidth = safeWidth - leftWidth - 1;
  const lines = [header, help];
  lines.push(...joinPanels(
    panel(summaryLines(summary, selectedSummary, mode), leftWidth, topHeight, { title: 'STORAGE SUMMARY', mode, active: true }),
    panel(ageLines(summary, mode), rightWidth, topHeight, { title: 'BY AGE', mode }),
    leftWidth,
    topHeight
  ));
  lines.push(...joinPanels(
    panel(largestLines(summary, selectedIds, mode), leftWidth, lowerHeight, { title: 'LARGEST SESSIONS · [-] protected', mode }),
    panel(projectLines(summary, mode), rightWidth, lowerHeight, { title: 'BY PROJECT', mode }),
    leftWidth,
    lowerHeight
  ));
  lines.push(footer);
  return { lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')), width: safeWidth, height: safeHeight };
}

export function renderClearConfirmation({
  rows = [],
  selectedIds = new Set(),
  selectedSummary = { count: 0, sizeBytes: 0 },
  width = 120,
  height = 36,
  mode = '256'
} = {}) {
  const safeWidth = Math.max(60, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const selected = rows.filter((row) => selectedIds.has(row?.id));
  const title = hpaint(`CLEAR ${selectedSummary.count} ENDED SESSIONS · ${fmtBytes(selectedSummary.sizeBytes)}?`, 'error', mode);
  const lines = [truncateCells('CODEX // STORAGE CLEAR CONFIRMATION', safeWidth, ''), truncateCells(title, safeWidth, '')];
  lines.push(hpaint('Only files that still pass fresh process/path/state checks will be removed.', 'pressure', mode));
  const visible = Math.max(1, safeHeight - 7);
  for (const row of selected.slice(0, visible)) {
    lines.push(truncateCells(`${hpaint('[x]', 'nav', mode)} ${padCells(truncateCells(row.project ?? 'UNKNOWN', 26, '…'), 26)} ${hpaint(shortId(row), 'session', mode)}  ${fmtBytes(row.fileSizeBytes ?? row.sizeBytes)}`, safeWidth, ''));
  }
  if (selected.length > visible) lines.push(hpaint(`… ${selected.length - visible} more selected sessions`, 'dim', mode));
  while (lines.length < safeHeight - 2) lines.push('');
  lines.push(truncateCells(`${hpaint('Y', 'error', mode)} confirm clear    ${hpaint('N / Esc', 'nav', mode)} cancel`, safeWidth, ''));
  lines.push(hpaint('LIVE and uncertain sessions are always protected.', 'dim', mode));
  return { lines: lines.slice(0, safeHeight), width: safeWidth, height: safeHeight };
}
