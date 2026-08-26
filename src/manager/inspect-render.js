import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from '../history/theme.js';

export const MANAGER_INSPECT_TABS = Object.freeze(['info', 'tokens', 'turns', 'tools', 'resources', 'errors']);

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

function tabLines(detail, tab) {
  if (tab === 'tokens') return telemetryLines(detail).slice(0, 5);
  if (tab === 'turns') return [
    `Turns        ${fmtNum(detail.turns?.count)}`,
    `Completed    ${fmtNum(detail.turns?.completed)}`,
    `Last turn    ${fmtDuration(detail.turns?.lastDurationMs)}`,
    '',
    'Phase 10 expands turn dynamics and timelines.'
  ];
  if (tab === 'tools') {
    const tools = Array.isArray(detail.tools?.byName) ? detail.tools.byName : [];
    return [`Total tools  ${fmtNum(detail.tools?.count)}`, '', ...tools.slice(0, 12).map((item) => `${String(fmtNum(item.count)).padStart(6)}  ${item.name ?? '--'}`)];
  }
  if (tab === 'resources') {
    const evidence = Array.isArray(detail.resources?.evidence) ? detail.resources.evidence : [];
    return evidence.length
      ? evidence.slice(0, 14).map((item) => `${item.kind ?? '--'}  ${item.value ?? '--'}`)
      : ['No historical resource evidence.', '', 'Resources are evidence-based; current filesystem state is not inferred.'];
  }
  if (tab === 'errors') {
    const errors = Array.isArray(detail.errors) ? detail.errors : [];
    return errors.length
      ? errors.slice(-14).reverse().map((item) => `${fmtDate(item.atMs).slice(11, 19)}  ${item.detail ?? '--'}`)
      : ['No recorded errors in selected session.'];
  }
  return infoLines(detail);
}

function tabsLine(activeTab, mode) {
  return MANAGER_INSPECT_TABS.map((tab) => {
    const label = `${tab[0].toUpperCase()}${tab.slice(1)}`;
    return tab === activeTab ? hpaint(`[${label}]`, 'nav', mode) : label;
  }).join('  ');
}

export function renderSessionInspect({ detail, width = 120, height = 36, mode = '256', activeTab = 'info' } = {}) {
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const tab = MANAGER_INSPECT_TABS.includes(activeTab) ? activeTab : 'info';
  const state = detail?.state ?? 'UNKNOWN';
  const title = detail?.info?.project ?? detail?.info?.threadId ?? 'SESSION';
  const header = truncateCells(`${hpaint('CODEX // SESSION INSPECT', 'strong', mode)}  ${hpaint(String(state), state === 'LIVE' ? 'live' : 'secondary', mode)}  ${title}`, safeWidth, '');
  const tabs = truncateCells(`${tabsLine(tab, mode)}    Phase 10 expands analytics`, safeWidth, '');
  const footer = truncateCells('←/→ or Tab change tab   Q/Esc back to dashboard   exact selected-session history only', safeWidth, '');
  const lines = [header, tabs];
  const bodyHeight = safeHeight - 3;

  if (!detail) {
    lines.push(...panel(['Selected session detail is unavailable.'], safeWidth, bodyHeight, { title: 'SESSION', mode, active: true }));
  } else if (tab === 'info' && safeWidth >= 92) {
    const leftWidth = Math.max(38, Math.floor(safeWidth * 0.5));
    const rightWidth = safeWidth - leftWidth - 1;
    const left = panel(infoLines(detail), leftWidth, bodyHeight, { title: 'IDENTITY', mode, active: true });
    const right = panel(telemetryLines(detail), rightWidth, bodyHeight, { title: 'EXACT TELEMETRY', mode });
    lines.push(...join(left, right, leftWidth, bodyHeight));
  } else {
    const titleByTab = {
      info: 'IDENTITY', tokens: 'TOKENS', turns: 'TURNS', tools: 'TOOLS', resources: 'RESOURCES', errors: 'ERRORS'
    };
    lines.push(...panel(tabLines(detail, tab), safeWidth, bodyHeight, { title: titleByTab[tab], mode, active: true }));
  }

  lines.push(footer);
  return {
    lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')),
    width: safeWidth,
    height: safeHeight,
    activeTab: tab,
    detail
  };
}
