import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from '../history/theme.js';

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
  if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(1)}M`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${Math.round(n)}B`;
}

function fmtDate(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '--';
  try { return new Date(n).toISOString().replace('T', ' ').slice(0, 19); } catch { return '--'; }
}

function fmtDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '--';
  const seconds = Math.floor(n / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function fmtPercent(used, window) {
  const a = Number(used);
  const b = Number(window);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return '--';
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
    `Project      ${detail.info?.project ?? '--'}`,
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

export function renderSessionInspect({ detail, width = 120, height = 36, mode = '256' } = {}) {
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const state = detail?.state ?? 'UNKNOWN';
  const title = detail?.info?.project ?? detail?.info?.threadId ?? 'SESSION';
  const header = truncateCells(`${hpaint('CODEX // SESSION INSPECT', 'strong', mode)}  ${hpaint(String(state), state === 'LIVE' ? 'live' : 'secondary', mode)}  ${title}`, safeWidth, '');
  const tabs = truncateCells('[Info]  Tokens  Turns  Tools  Resources  Errors    Phase 10 expands analytics', safeWidth, '');
  const footer = truncateCells('Q/Esc back to dashboard   exact selected-session history only', safeWidth, '');
  const lines = [header, tabs];
  const bodyHeight = safeHeight - 3;

  if (!detail) {
    lines.push(...panel(['Selected session detail is unavailable.'], safeWidth, bodyHeight, { title: 'SESSION', mode, active: true }));
  } else if (safeWidth < 92) {
    const infoHeight = Math.max(8, Math.floor(bodyHeight * 0.5));
    lines.push(...panel(infoLines(detail), safeWidth, infoHeight, { title: 'IDENTITY', mode, active: true }));
    lines.push(...panel(telemetryLines(detail), safeWidth, bodyHeight - infoHeight, { title: 'EXACT TELEMETRY', mode }));
  } else {
    const leftWidth = Math.max(38, Math.floor(safeWidth * 0.5));
    const rightWidth = safeWidth - leftWidth - 1;
    const left = panel(infoLines(detail), leftWidth, bodyHeight, { title: 'IDENTITY', mode, active: true });
    const right = panel(telemetryLines(detail), rightWidth, bodyHeight, { title: 'EXACT TELEMETRY', mode });
    lines.push(...join(left, right, leftWidth, bodyHeight));
  }

  lines.push(footer);
  return {
    lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')),
    width: safeWidth,
    height: safeHeight,
    detail
  };
}
