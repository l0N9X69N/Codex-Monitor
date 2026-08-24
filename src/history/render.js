import path from 'node:path';
import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from './theme.js';

const DETAIL_TABS = Object.freeze(['Info', 'Tokens', 'Turns', 'Tools', 'Resources', 'Errors']);

function fmtNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(ms) {
  if (!Number.isFinite(ms)) return '--';
  try { return new Date(ms).toISOString().replace('T', ' ').slice(0, 19); } catch { return '--'; }
}

function borderLine(width, title = '', mode = '256', active = false) {
  const label = title ? ` ${title} ` : '';
  const left = active ? '╔' : '┌';
  const right = active ? '╗' : '┐';
  const horizontal = active ? '═' : '─';
  const raw = `${left}${label}${horizontal.repeat(Math.max(0, width - cellWidth(label) - 2))}${right}`;
  return hpaint(truncateCells(raw, width, ''), active ? 'nav' : 'panel', mode);
}

function panel(lines, width, height, { title = '', mode = '256', active = false } = {}) {
  const inner = Math.max(1, width - 2);
  const result = [borderLine(width, title, mode, active)];
  for (let i = 0; i < Math.max(0, height - 2); i += 1) {
    const text = truncateCells(lines[i] ?? '', inner, '');
    result.push(`${hpaint(active ? '║' : '│', active ? 'nav' : 'panel', mode)}${padCells(text, inner)}${hpaint(active ? '║' : '│', active ? 'nav' : 'panel', mode)}`);
  }
  const bottom = `${active ? '╚' : '└'}${(active ? '═' : '─').repeat(inner)}${active ? '╝' : '┘'}`;
  result.push(hpaint(bottom, active ? 'nav' : 'panel', mode));
  return result.slice(0, height);
}

function sessionRows(sessions, selectedIndex, width, rows, mode) {
  const result = [];
  const nameWidth = Math.max(10, Math.floor(width * 0.52));
  for (let i = 0; i < Math.min(rows, sessions.length); i += 1) {
    const item = sessions[i];
    const marker = i === selectedIndex ? '▶' : ' ';
    const name = truncateCells(item.name ?? path.basename(item.filePath ?? ''), nameWidth, '…');
    const size = fmtNum(item.sizeBytes);
    const when = fmtDate(item.modifiedAtMs).slice(5, 16);
    const text = `${marker} ${padCells(name, nameWidth)} ${size.padStart(7)} ${when}`;
    result.push(i === selectedIndex ? hpaint(text, 'nav', mode) : text);
  }
  return result;
}

function detailLines(model, tab) {
  if (!model) return ['No session selected.'];
  if (tab === 'Info') return [
    `Thread     ${model.info.threadId ?? '--'}`,
    `Model      ${model.info.model ?? '--'}`,
    `Reasoning  ${model.info.reasoning ?? '--'}`,
    `Started    ${fmtDate(model.info.startedAtMs)}`,
    `Last event ${fmtDate(model.info.lastEventAtMs)}`,
    `CWD        ${model.info.cwd ?? '--'}`
  ];
  if (tab === 'Tokens') return [
    `Input      ${fmtNum(model.tokens.input)}`,
    `Cached     ${fmtNum(model.tokens.cached)}`,
    `Output     ${fmtNum(model.tokens.output)}`,
    `Reasoning  ${fmtNum(model.tokens.reasoning)}`,
    `Context    ${fmtNum(model.tokens.contextUsed)} / ${fmtNum(model.tokens.contextWindow)}`
  ];
  if (tab === 'Turns') return [`Turns      ${model.turns.count}`, `Completed  ${model.turns.completed}`, `Last dur   ${model.turns.lastDurationMs ?? '--'} ms`];
  if (tab === 'Tools') {
    const top = Object.entries(model.tools.byName).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return [`Total ${model.tools.count}`, ...top.map(([name, count]) => `${String(count).padStart(4)}  ${name}`)];
  }
  if (tab === 'Resources') return model.resources.evidence.length ? model.resources.evidence.map((item) => `${item.kind}: ${item.value}`) : ['-- evidence only --'];
  if (tab === 'Errors') return model.errors.length ? model.errors.slice(-10).reverse().map((item) => `${fmtDate(item.atMs).slice(11, 19)} ${item.detail ?? '--'}`) : ['No recorded errors.'];
  return [];
}

export function renderHistoryFrame({
  sessions = [], selectedIndex = 0, selectedModel = null, activeDetailTab = 0,
  width = 100, height = 30, mode = '256', status = 'LOCAL JSONL · RAM INDEX', liveTail = false
} = {}) {
  const safeWidth = Math.max(40, Number(width) || 100);
  const safeHeight = Math.max(12, Number(height) || 30);
  const detailTab = DETAIL_TABS[Math.max(0, Math.min(DETAIL_TABS.length - 1, activeDetailTab))];
  const header = truncateCells(`${hpaint('CODEX // HISTORY', 'strong', mode)}  ${hpaint(status, liveTail ? 'live' : 'secondary', mode)}`, safeWidth, '');
  const tabs = DETAIL_TABS.map((name, index) => index === activeDetailTab ? hpaint(`[${name}]`, 'nav', mode) : name).join('  ');
  const footer = truncateCells('↑↓ session   ←→ detail   R refresh   T live-tail   Q/Esc exit', safeWidth, '');
  const bodyHeight = safeHeight - 3;
  const lines = [header];

  if (safeWidth >= 118) {
    const leftWidth = Math.max(42, Math.floor(safeWidth * 0.43));
    const rightWidth = safeWidth - leftWidth - 1;
    const left = panel(sessionRows(sessions, selectedIndex, leftWidth - 2, bodyHeight - 2, mode), leftWidth, bodyHeight, { title: `SESSIONS ${sessions.length}`, mode, active: true });
    const right = panel([tabs, '', ...detailLines(selectedModel, detailTab)], rightWidth, bodyHeight, { title: detailTab.toUpperCase(), mode });
    for (let i = 0; i < bodyHeight; i += 1) lines.push(`${left[i] ?? ''.padEnd(leftWidth)} ${right[i] ?? ''}`);
  } else {
    const sessionsHeight = Math.max(5, Math.floor(bodyHeight * 0.48));
    lines.push(...panel(sessionRows(sessions, selectedIndex, safeWidth - 2, sessionsHeight - 2, mode), safeWidth, sessionsHeight, { title: `SESSIONS ${sessions.length}`, mode, active: true }));
    const remaining = bodyHeight - sessionsHeight;
    if (remaining > 2) lines.push(...panel([tabs, ...detailLines(selectedModel, detailTab)], safeWidth, remaining, { title: detailTab.toUpperCase(), mode }));
  }

  lines.push(footer);
  return { lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')), width: safeWidth, height: safeHeight, detailTab };
}

export { DETAIL_TABS };
