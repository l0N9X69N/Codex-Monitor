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
  return hpaint(truncateCells(`${left}${label}${horizontal.repeat(Math.max(0, width - cellWidth(label) - 2))}${right}`, width, ''), active ? 'nav' : 'panel', mode);
}

function panel(lines, width, height, { title = '', mode = '256', active = false } = {}) {
  const inner = Math.max(1, width - 2);
  const result = [borderLine(width, title, mode, active)];
  for (let i = 0; i < Math.max(0, height - 2); i += 1) {
    const text = truncateCells(lines[i] ?? '', inner, '');
    result.push(`${hpaint(active ? '║' : '│', active ? 'nav' : 'panel', mode)}${padCells(text, inner)}${hpaint(active ? '║' : '│', active ? 'nav' : 'panel', mode)}`);
  }
  result.push(hpaint(`${active ? '╚' : '└'}${(active ? '═' : '─').repeat(inner)}${active ? '╝' : '┘'}`, active ? 'nav' : 'panel', mode));
  return result.slice(0, height);
}

function sessionRows(sessions, selectedIndex, width, rows, mode) {
  const result = [];
  const nameWidth = Math.max(10, Math.floor(width * 0.52));
  for (let i = 0; i < Math.min(rows, sessions.length); i += 1) {
    const item = sessions[i];
    const marker = i === selectedIndex ? '▶' : ' ';
    const name = truncateCells(item.name ?? path.basename(item.filePath ?? ''), nameWidth, '…');
    const text = `${marker} ${padCells(name, nameWidth)} ${fmtNum(item.sizeBytes).padStart(7)} ${fmtDate(item.modifiedAtMs).slice(5, 16)}`;
    result.push(i === selectedIndex ? hpaint(text, 'nav', mode) : text);
  }
  return result;
}

function detailLines(model, tab) {
  if (!model) return ['No session selected.'];
  if (tab === 'Info') return [`Thread     ${model.info.threadId ?? '--'}`, `Model      ${model.info.model ?? '--'}`, `Reasoning  ${model.info.reasoning ?? '--'}`, `Started    ${fmtDate(model.info.startedAtMs)}`, `Last event ${fmtDate(model.info.lastEventAtMs)}`, `CWD        ${model.info.cwd ?? '--'}`];
  if (tab === 'Tokens') return [`Input      ${fmtNum(model.tokens.input)}`, `Cached     ${fmtNum(model.tokens.cached)}`, `Output     ${fmtNum(model.tokens.output)}`, `Reasoning  ${fmtNum(model.tokens.reasoning)}`, `Context    ${fmtNum(model.tokens.contextUsed)} / ${fmtNum(model.tokens.contextWindow)}`];
  if (tab === 'Turns') return [`Turns      ${model.turns.count}`, `Completed  ${model.turns.completed}`, `Last dur   ${model.turns.lastDurationMs ?? '--'} ms`];
  if (tab === 'Tools') return [`Total ${model.tools.count}`, ...Object.entries(model.tools.byName).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => `${String(count).padStart(4)}  ${name}`)];
  if (tab === 'Resources') return model.resources.evidence.length ? model.resources.evidence.map((item) => `${item.kind}: ${item.value}`) : ['-- evidence only --'];
  if (tab === 'Errors') return model.errors.length ? model.errors.slice(-10).reverse().map((item) => `${fmtDate(item.atMs).slice(11, 19)} ${item.detail ?? '--'}`) : ['No recorded errors.'];
  return [];
}

function storageLines(sessions) {
  const total = sessions.reduce((sum, item) => sum + (Number(item.sizeBytes) || 0), 0);
  return [
    `Indexed sessions  ${sessions.length}`,
    `JSONL bytes       ${fmtNum(total)}`,
    '',
    'Storage management is intentionally read-only in Phase 09.',
    'Delete/archive safety is implemented and gated in Phase 11.',
    'No History database or duplicate session store is created.'
  ];
}

export function renderHistoryFrame({
  sessions = [], selectedIndex = 0, selectedModel = null, activeDetailTab = 0,
  width = 100, height = 30, mode = '256', status = 'LOCAL JSONL · RAM INDEX', liveTail = false, storageMode = false
} = {}) {
  const safeWidth = Math.max(40, Number(width) || 100);
  const safeHeight = Math.max(12, Number(height) || 30);
  const detailTab = DETAIL_TABS[Math.max(0, Math.min(DETAIL_TABS.length - 1, activeDetailTab))];
  const header = truncateCells(`${hpaint('CODEX // HISTORY', 'strong', mode)}  ${hpaint(status, liveTail ? 'live' : 'secondary', mode)}`, safeWidth, '');
  const tabs = DETAIL_TABS.map((name, index) => index === activeDetailTab && !storageMode ? hpaint(`[${name}]`, 'nav', mode) : name).join('  ');
  const footer = truncateCells('↑↓ session   ←→ detail   S Storage   R refresh   T live-tail   Q/Esc exit', safeWidth, '');
  const bodyHeight = safeHeight - 3;
  const lines = [header];
  const detailTitle = storageMode ? 'STORAGE' : detailTab.toUpperCase();
  const detailContent = storageMode ? storageLines(sessions) : detailLines(selectedModel, detailTab);

  if (safeWidth >= 118) {
    const leftWidth = Math.max(42, Math.floor(safeWidth * 0.43));
    const rightWidth = safeWidth - leftWidth - 1;
    const left = panel(sessionRows(sessions, selectedIndex, leftWidth - 2, bodyHeight - 2, mode), leftWidth, bodyHeight, { title: `SESSIONS ${sessions.length}`, mode, active: !storageMode });
    const right = panel([tabs, '', ...detailContent], rightWidth, bodyHeight, { title: detailTitle, mode, active: storageMode });
    for (let i = 0; i < bodyHeight; i += 1) lines.push(`${left[i] ?? ''.padEnd(leftWidth)} ${right[i] ?? ''}`);
  } else {
    const sessionsHeight = Math.max(5, Math.floor(bodyHeight * 0.48));
    lines.push(...panel(sessionRows(sessions, selectedIndex, safeWidth - 2, sessionsHeight - 2, mode), safeWidth, sessionsHeight, { title: `SESSIONS ${sessions.length}`, mode, active: !storageMode }));
    const remaining = bodyHeight - sessionsHeight;
    if (remaining > 2) lines.push(...panel([tabs, ...detailContent], safeWidth, remaining, { title: detailTitle, mode, active: storageMode }));
  }

  lines.push(footer);
  return { lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')), width: safeWidth, height: safeHeight, detailTab, storageMode };
}

export { DETAIL_TABS };
