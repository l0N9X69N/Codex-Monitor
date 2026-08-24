import { truncateCells } from './cell-width.js';

function value(metric, fallback = null) {
  if (metric && typeof metric === 'object' && Object.prototype.hasOwnProperty.call(metric, 'value')) return metric.value ?? fallback;
  return metric ?? fallback;
}

function fmtNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return '--';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '--';
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}g`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n * 10) / 10);
}

function pct(raw) { return raw !== null && raw !== undefined && Number.isFinite(Number(raw)) ? `${Math.round(Number(raw))}%` : '--'; }

function sparkline(values = [], width = 16) {
  const chars = '▁▂▃▄▅▆▇█';
  const numeric = values.filter(Number.isFinite).slice(-Math.max(2, width));
  if (!numeric.length) return '--';
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const span = Math.max(1e-9, max - min);
  return numeric.map((n) => chars[Math.max(0, Math.min(chars.length - 1, Math.round(((n - min) / span) * (chars.length - 1))))]).join('');
}

function quota(window, label) {
  const q = value(window);
  if (!q || !Number.isFinite(Number(q.remainingPercent))) return `${label} --`;
  return `${label} ${Math.round(Number(q.remainingPercent))}% left${q.resetsAt ? ` ↻ ${q.resetsAt}` : ''}`;
}

function usageLines(state) {
  const auth = value(state?.auth?.mode, 'unknown');
  const cacheRatio = value(state?.usage?.cacheRatio, null);
  const lines = [
    `CONTEXT ${fmtNumber(value(state?.context?.usedTokens))} used · ${fmtNumber(value(state?.context?.leftTokens))} left · ${fmtNumber(value(state?.context?.windowTokens))} window`,
    `TOKENS  in ${fmtNumber(value(state?.usage?.inputTokens))} · cached ${fmtNumber(value(state?.usage?.cachedInputTokens))} · out ${fmtNumber(value(state?.usage?.outputTokens))} · reasoning ${fmtNumber(value(state?.usage?.reasoningTokens))}`,
    `TURN    in ${fmtNumber(value(state?.usage?.turnInputTokens))} · out ${fmtNumber(value(state?.usage?.turnOutputTokens))} · cache ${pct(cacheRatio == null ? null : cacheRatio * 100)}`,
    `MODEL   requested ${value(state?.model?.requested, '--')} · actual ${value(state?.model?.actual, '--')} · reasoning ${value(state?.model?.reasoning, '--')}`,
    `FRESH   session ${state?.session?.lastEventAtMs?.freshness ?? 'waiting'} · usage ${state?.usage?.inputTokens?.freshness ?? 'waiting'}`
  ];
  if (auth === 'login') lines.splice(3, 0, `${quota(state?.quota?.fiveHour, '5H')} · ${quota(state?.quota?.weekly, 'WEEK')}`);
  return lines;
}

function toolsLines(state) {
  const current = value(state?.tools?.current);
  const last = value(state?.tools?.last);
  const counts = value(state?.tools?.counts, {}) ?? {};
  const recent = value(state?.tools?.recent, []) ?? [];
  const active = value(state?.activity?.activeTools, []) ?? [];
  const lines = [
    `CURRENT ${current?.name ?? (active.length ? `${active.length} active call(s)` : '--')}`,
    `LAST    ${last?.name ?? '--'}${last?.ok === false ? ' · ERROR' : ''}${last?.detail ? ` · ${last.detail}` : ''}`,
    `TOTAL   ${Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0)} calls · ${value(state?.tools?.errorCount, 0)} errors`
  ];
  for (const item of recent.slice(-3).reverse()) lines.push(`• ${item.name ?? 'tool'}${item.detail ? ` · ${item.detail}` : ''}`);
  return lines;
}

function resourcesLines(state) {
  const rows = [];
  for (const [label, key] of [['INSTR', 'instructions'], ['SKILLS', 'skills'], ['MCP', 'mcp'], ['RULES', 'rules'], ['PERMS', 'permissions']]) {
    const items = value(state?.resources?.[key], null);
    if (items == null) rows.push(`${label.padEnd(6)} --`);
    else if (!items.length) rows.push(`${label.padEnd(6)} none`);
    else rows.push(`${label.padEnd(6)} ${items.length} · ${items.slice(0, 4).join(', ')}`);
  }
  return rows;
}

function processesLines(state) {
  const list = value(state?.processes?.list, []) ?? [];
  const hot = value(state?.processes?.hot);
  const lines = [`ROOT ${value(state?.processes?.rootPid, '--')} · ${list.length} process(es) · HOT ${hot ? `${hot.name} ${pct(hot.cpuPercent)}` : '--'}`];
  for (const item of [...list].sort((a, b) => (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1)).slice(0, 5)) {
    lines.push(`${String(item.pid ?? '--').padStart(6)}  ${pct(item.cpuPercent).padStart(4)}  ${fmtNumber(item.memoryBytes).padStart(7)}  ${item.name ?? '--'}  ${item.command ?? ''}`);
  }
  return lines;
}

function performanceLines(state) {
  const samples = value(state?.performance?.samples, []) ?? [];
  const cpuSeries = samples.map((s) => s.codexCpuPercent).filter(Number.isFinite);
  const memSeries = samples.map((s) => s.codexMemoryBytes).filter(Number.isFinite);
  return [
    `CODEX   CPU ${pct(value(state?.performance?.codexCpuPercent))} ${sparkline(cpuSeries, 18)} · RAM ${fmtNumber(value(state?.performance?.codexMemoryBytes))}`,
    `MONITOR CPU ${pct(value(state?.performance?.monitorCpuPercent))} · RAM ${fmtNumber(value(state?.performance?.monitorMemoryBytes))}`,
    `SYSTEM  CPU ${pct(value(state?.performance?.systemCpuPercent))} · RAM ${fmtNumber(value(state?.performance?.systemMemoryBytes))}`,
    `RAM TREND ${sparkline(memSeries, 24)}`
  ];
}

export function renderLiveView(activeTab, state, { width = 80, maxRows = 4 } = {}) {
  let lines;
  if (activeTab === 'tools') lines = toolsLines(state);
  else if (activeTab === 'resources') lines = resourcesLines(state);
  else if (activeTab === 'processes') lines = processesLines(state);
  else if (activeTab === 'performance') lines = performanceLines(state);
  else if (activeTab === 'usage') lines = usageLines(state);
  else lines = [];
  return lines.slice(0, Math.max(1, maxRows)).map((line) => truncateCells(line, width, ''));
}

export { sparkline };
