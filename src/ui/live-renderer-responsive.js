import { buildLiveFrame as buildBaseLiveFrame, assertNoWrap, formatBytes, formatQuotaReset } from './live-renderer.js';
import { cellWidth, padCells, truncateCells } from './cell-width.js';
import { paint, styleText } from './theme.js';

const ULTRAWIDE_SYSTEM_CARD_MIN_CELLS = 200;

function value(metric, fallback = null) {
  if (metric && typeof metric === 'object' && Object.prototype.hasOwnProperty.call(metric, 'value')) return metric.value ?? fallback;
  return metric ?? fallback;
}

function finite(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function fmtNumber(raw) {
  const n = finite(raw);
  if (n == null) return '--';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(n * 10) / 10);
}

function pct(raw) {
  const n = finite(raw);
  return n == null ? '--' : `${Math.round(n)}%`;
}

function fmtDuration(raw) {
  const n = finite(raw);
  if (n == null) return '--';
  if (n < 1000) return `${Math.round(n)}ms`;
  const seconds = Math.floor(n / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${seconds % 60 ? `${String(seconds % 60).padStart(2, '0')}s` : ''}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${String(minutes % 60).padStart(2, '0')}m`;
}

function fmtAge(raw, nowMs) {
  const n = finite(raw);
  return n == null ? '--' : fmtDuration(Math.max(0, nowMs - n));
}

function distribute(total, count) {
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

function tableRow(cells, widths, theme) {
  const edge = paint('│', 'frame', theme);
  const body = cells.map((cell, index) => {
    const inner = Math.max(0, widths[index] - 2);
    return ` ${padCells(truncateCells(cell ?? '', inner, ''), inner)} `;
  }).join(edge);
  return `${edge}${body}${edge}`;
}

function horizontalBorder(left, mid, right, widths, theme) {
  return paint(`${left}${widths.map((width) => '─'.repeat(width)).join(mid)}${right}`, 'frame', theme);
}

function title(text, token, theme) {
  return styleText(text, token, theme, { bold: true });
}

function systemRows(state, theme) {
  const used = finite(value(state?.system?.memoryBytes));
  const total = finite(value(state?.system?.totalMemoryBytes));
  const free = finite(value(state?.system?.freeMemoryBytes));
  const memoryPercent = used != null && total != null && total > 0 ? (used / total) * 100 : null;
  return [
    `${styleText('CPU', 'label', theme)} ${styleText(pct(value(state?.system?.cpuPercent)), 'info', theme, { bold: true })}`,
    `${styleText('RAM', 'label', theme)} ${styleText(formatBytes(used), 'bright', theme)}${memoryPercent == null ? '' : ` ${paint('·', 'frame', theme)} ${styleText(pct(memoryPercent), 'info', theme)}`}`,
    `${styleText('TOTAL', 'label', theme)} ${styleText(formatBytes(total), 'bright', theme)}`,
    `${styleText('FREE', 'label', theme)} ${styleText(formatBytes(free), 'healthy', theme)}`
  ];
}

function contextRows(state, theme) {
  const used = finite(value(state?.context?.usedTokens));
  const window = finite(value(state?.context?.windowTokens));
  const usedPercent = finite(value(state?.context?.usedPercent)) ?? (used != null && window > 0 ? (used / window) * 100 : null);
  return [
    `${styleText(`${pct(usedPercent)} used`, 'thinking', theme, { bold: true })} ${paint('·', 'frame', theme)} ${fmtNumber(used)}/${fmtNumber(window)}`,
    `${styleText('CACHE', 'label', theme)} ${styleText(fmtNumber(value(state?.usage?.cachedInputTokens)), 'info', theme)}`,
    `${styleText('LEFT', 'label', theme)} ${pct(value(state?.context?.leftPercent))}`,
    `${styleText('CMP', 'label', theme)} ${styleText(fmtNumber(value(state?.compaction?.count)), 'reasoning', theme)}`
  ];
}

function usageRows(state, theme, nowMs) {
  const auth = value(state?.auth?.mode, 'unknown');
  if (auth === 'login') {
    const five = value(state?.quota?.fiveHour);
    const week = value(state?.quota?.weekly);
    const q = (label, item) => {
      if (!item || finite(item.remainingPercent) == null) return `${label} waiting…`;
      const reset = formatQuotaReset(item.resetsAtMs ?? item.resetsAt, nowMs);
      return `${label} ${Math.round(item.remainingPercent)}% left${reset ? ` ↻ ${reset}` : ''}`;
    };
    return [
      q('5H', five),
      q('WEEK', week),
      `IN ${fmtNumber(value(state?.usage?.inputTokens))} · CACHE ${fmtNumber(value(state?.usage?.cachedInputTokens))} · OUT ${fmtNumber(value(state?.usage?.outputTokens))}`,
      `RSN ${fmtNumber(value(state?.usage?.reasoningTokens))} · T.IN ${fmtNumber(value(state?.usage?.turnInputTokens))} · T.OUT ${fmtNumber(value(state?.usage?.turnOutputTokens))}`
    ];
  }
  return [
    `MODEL ${value(state?.model?.requested, '--')}`,
    `ACTUAL ${value(state?.model?.actual, 'waiting…')}`,
    `IN ${fmtNumber(value(state?.usage?.inputTokens))} · CACHE ${fmtNumber(value(state?.usage?.cachedInputTokens))}`,
    `OUT ${fmtNumber(value(state?.usage?.outputTokens))} · RSN ${fmtNumber(value(state?.usage?.reasoningTokens))}`
  ];
}

function sessionRows(state, theme, nowMs) {
  const freshness = state?.session?.lastEventAtMs?.freshness ?? 'waiting';
  return [
    `elapsed ${fmtDuration(Math.max(0, nowMs - (state?.run?.startedAtMs ?? nowMs)))} · turns ${fmtNumber(value(state?.session?.turnCount))}`,
    `last ${fmtDuration(value(state?.session?.lastTurnDurationMs))} · update ${fmtAge(value(state?.session?.lastEventAtMs), nowMs)}`,
    `thread ${String(value(state?.session?.threadId, '--')).slice(0, 12)} · fresh ${freshness}`,
    `data ${value(state?.session?.bound, false) ? 'current rollout' : 'waiting'}`
  ];
}

function activityRows(state, theme) {
  const activity = String(value(state?.activity?.state, 'IDLE')).toUpperCase();
  const symbol = activity === 'ERROR' ? '×' : activity === 'APPROVAL' ? '!' : activity === 'TOOL' ? '◆' : '●';
  const currentTool = value(state?.tools?.current, null);
  const lastTool = value(state?.tools?.last, null);
  const activeTools = value(state?.activity?.activeTools, []);
  return [
    `${symbol} ${activity} ${value(state?.activity?.detail, '')}`.trim(),
    `source ${value(state?.activity?.source, 'runtime')}`,
    `tools ${Array.isArray(activeTools) ? activeTools.length : '--'} · ${currentTool ? 'current' : 'last'} ${(currentTool ?? lastTool)?.name ?? '--'}`,
    `approval ${Boolean(value(state?.activity?.approvalPending, false))} · retry ${fmtNumber(value(state?.activity?.retryCount))} · err ${fmtNumber(value(state?.activity?.errorCount))}`
  ];
}

function ultrawideFiveCardFrame({ state, config, width, height, cwd, nowMs, projectName, health, gitLabel, fast, previousLaneCount, hysteresisCells }) {
  const base = buildBaseLiveFrame({ state, config, width, height, cwd, nowMs, projectName, health, gitLabel, fast, previousLaneCount, hysteresisCells });
  if (config?.preset !== 'full' || config?.sections?.system !== true || config?.metrics?.system === false || width < ULTRAWIDE_SYSTEM_CARD_MIN_CELLS || base.lines.length < 2) return base;

  const theme = config?.theme ?? 'color';
  const available = width - 6;
  const widths = distribute(available, 5);
  const innerWidths = widths.map((item) => Math.max(1, item - 2));
  const auth = value(state?.auth?.mode, 'unknown');
  const titles = [
    title('CONTEXT', 'info', theme),
    title(`USAGE${auth === 'login' ? ' · LOGIN' : auth === 'api' ? ' · API' : ''}`, 'reasoning', theme),
    title('SESSION', 'healthy', theme),
    title('CURRENT ACTIVITY', 'thinking', theme),
    title('SYSTEM', 'info', theme)
  ];
  const columns = [
    contextRows(state, theme),
    usageRows(state, theme, nowMs),
    sessionRows(state, theme, nowMs),
    activityRows(state, theme),
    systemRows(state, theme)
  ];

  const lines = [
    base.lines[0],
    base.lines[1],
    horizontalBorder('├', '┬', '┤', widths, theme),
    tableRow(titles, widths, theme)
  ];
  for (let row = 0; row < 4; row += 1) lines.push(tableRow(columns.map((column, index) => truncateCells(column[row] ?? '', innerWidths[index], '')), widths, theme));
  lines.push(horizontalBorder('╰', '┴', '╯', widths, theme));

  return {
    ...base,
    lines,
    rowCount: lines.length,
    semantic: { ...base.semantic, visual: 'full-monitor-v2-grid-5', systemCard: true }
  };
}

export function buildLiveFrame(options = {}) {
  return ultrawideFiveCardFrame(options);
}

export { assertNoWrap, formatBytes, formatQuotaReset, ULTRAWIDE_SYSTEM_CARD_MIN_CELLS };
