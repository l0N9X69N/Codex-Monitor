import path from 'node:path';
import { assertNoWrap, formatBytes, formatQuotaReset } from './live-renderer.js';
import { cellWidth, padCells, truncateCells } from './cell-width.js';
import { paint, styleText } from './theme.js';
import { contextUsedSeverity, quotaRemainingSeverity, severityToken, systemPressureSeverity } from './severity.js';

// Kept as a compatibility export for callers/tests from the first 5-card
// implementation. The responsive grid no longer uses a single 200-cell gate.
const ULTRAWIDE_SYSTEM_CARD_MIN_CELLS = 200;
const MIN_SPARKLINE_SAMPLES = 4;
const SPARK_BLOCKS = '▁▂▃▄';
const MIN_CARD_OUTER_CELLS = 34;
const MAX_CARD_COLUMNS = 5;
const MIN_CHILD_ROWS = 8;
const MAX_MONITOR_ROWS = 16;

const CARD_REPRESENTATION = Object.freeze({
  MINIMAL: 'minimal',
  COMPACT: 'compact',
  NORMAL: 'normal',
  RICH: 'rich'
});

const REP_RANK = Object.freeze({
  [CARD_REPRESENTATION.MINIMAL]: 0,
  [CARD_REPRESENTATION.COMPACT]: 1,
  [CARD_REPRESENTATION.NORMAL]: 2,
  [CARD_REPRESENTATION.RICH]: 3
});

const RANK_REP = Object.freeze([
  CARD_REPRESENTATION.MINIMAL,
  CARD_REPRESENTATION.COMPACT,
  CARD_REPRESENTATION.NORMAL,
  CARD_REPRESENTATION.RICH
]);

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
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d${String(hours % 24).padStart(2, '0')}h`;
}

function fmtAge(raw, nowMs) {
  const n = finite(raw);
  return n == null ? '--' : fmtDuration(Math.max(0, nowMs - n));
}

function progressBar(percent, width) {
  const p = finite(percent);
  const cells = Math.max(4, Math.floor(width));
  if (p == null || cells <= 0) return null;
  const filled = Math.max(0, Math.min(cells, Math.round((Math.max(0, Math.min(100, p)) / 100) * cells)));
  return `${'━'.repeat(filled)}${'─'.repeat(cells - filled)}`;
}

function sparkline(values, width) {
  const clean = values.map(finite).filter((item) => item != null);
  if (clean.length < MIN_SPARKLINE_SAMPLES || width < 4) return null;
  const source = clean.slice(-Math.max(4, width));
  const min = Math.min(...source);
  const max = Math.max(...source);
  const range = max - min;
  return source.map((item) => {
    if (range <= 0.0001) return SPARK_BLOCKS[3];
    const index = Math.max(0, Math.min(SPARK_BLOCKS.length - 1, Math.round(((item - min) / range) * (SPARK_BLOCKS.length - 1))));
    return SPARK_BLOCKS[index];
  }).join('');
}

function activityInfo(state) {
  const activity = String(value(state?.activity?.state, 'IDLE')).toUpperCase();
  if (activity === 'ERROR') return { activity, symbol: '×', detail: 'failed', token: 'error' };
  if (activity === 'APPROVAL') return { activity, symbol: '!', detail: 'waiting approval', token: 'approval' };
  if (activity === 'TOOL') return { activity, symbol: '◆', detail: 'running tool', token: 'tool' };
  if (activity === 'THINKING') return { activity, symbol: '●', detail: 'reasoning', token: 'thinking' };
  return { activity: 'IDLE', symbol: '●', detail: 'waiting input', token: 'healthy' };
}

function healthText(state) {
  const info = activityInfo(state);
  const severity = contextUsedSeverity(value(state?.context?.usedPercent));
  if (info.activity === 'ERROR') return ['HEALTH ERROR', 'error'];
  if (info.activity === 'APPROVAL') return ['HEALTH WAIT', 'approval'];
  if (severity === 'critical') return ['HEALTH PRESSURE', 'error'];
  if (severity === 'high') return ['HEALTH HIGH', 'approval'];
  if (severity === 'warning') return ['HEALTH WARN', 'thinking'];
  return ['HEALTH OK', 'healthy'];
}

function gitSummary(state, maxCells = 72) {
  const branch = value(state?.git?.branch);
  if (!branch) return null;
  const dirty = value(state?.git?.dirty, null);
  const diff = value(state?.git?.diff);
  const ab = value(state?.git?.aheadBehind);
  const status = [];
  for (const [key, label] of [['added', 'A'], ['modified', 'M'], ['deleted', 'D'], ['renamed', 'R'], ['untracked', '?'], ['conflicted', '!']]) {
    const count = finite(diff?.[key]);
    if (count != null && count > 0) status.push(`${label}${count}`);
  }
  const changedFiles = finite(diff?.changedFiles);
  const additions = finite(diff?.additions);
  const deletions = finite(diff?.deletions);
  const candidates = [
    [
      `${branch}${dirty === true ? '*' : ''}`,
      status.join(' '),
      changedFiles == null ? '' : `${changedFiles} ${changedFiles === 1 ? 'file' : 'files'}`,
      additions == null && deletions == null ? '' : `Δ+${additions ?? '--'} −${deletions ?? '--'}`,
      ab && (ab.ahead != null || ab.behind != null) ? `↑${ab.ahead ?? '--'} ↓${ab.behind ?? '--'}` : ''
    ].filter(Boolean).join('  '),
    [`${branch}${dirty === true ? '*' : ''}`, status.join(' '), changedFiles == null ? '' : `${changedFiles} ${changedFiles === 1 ? 'file' : 'files'}`].filter(Boolean).join('  '),
    `${branch}${dirty === true ? '*' : ''}`
  ];
  return truncateCells(candidates.find((item) => cellWidth(item) <= maxCells) ?? candidates.at(-1), maxCells, '');
}

function headerItem(item, state, options, maxCells) {
  const info = activityInfo(state);
  if (item === 'activity') return `${styleText(`${info.symbol} ${info.activity}`, info.token, options.theme, { bold: true })} ${styleText(info.detail, 'muted', options.theme)}`;
  if (item === 'model') {
    const model = value(state?.model?.requested);
    return model ? styleText(truncateCells(String(model), 20), 'thinking', options.theme, { bold: true }) : null;
  }
  if (item === 'reasoning') {
    const reasoning = value(state?.model?.reasoning);
    return reasoning ? styleText(truncateCells(String(reasoning), 12), 'reasoning', options.theme) : null;
  }
  if (item === 'project') return styleText(truncateCells(options.projectName ?? path.basename(options.cwd ?? process.cwd()), 26), 'info', options.theme);
  if (item === 'git') {
    const text = gitSummary(state, Math.max(4, maxCells)) ?? options.gitLabel ?? null;
    return text ? styleText(text, 'healthy', options.theme) : null;
  }
  if (item === 'auth') {
    const auth = String(value(state?.auth?.mode, 'unknown')).toUpperCase();
    return `${styleText('AUTH', 'label', options.theme)} ${styleText(auth, auth === 'API' ? 'reasoning' : 'info', options.theme, { bold: true })}`;
  }
  if (item === 'health') {
    const [text, token] = healthText(state);
    return styleText(text, token, options.theme, { bold: true });
  }
  if (item === 'session-age') return `${styleText('AGE', 'label', options.theme)} ${fmtDuration(Math.max(0, options.nowMs - (state?.run?.startedAtMs ?? options.nowMs)))}`;
  if (item === 'fast') return options.fast ? styleText('FAST', 'thinking', options.theme, { bold: true }) : null;
  return null;
}

function topBorder(width, preset, theme) {
  const prefix = '╭─';
  const suffix = '╮';
  const maxTitle = Math.max(0, width - cellWidth(prefix) - cellWidth(suffix));
  const titleText = truncateCells(` CODEX MONITOR · ${String(preset ?? 'recommended').toUpperCase()} `, maxTitle, '');
  const fill = Math.max(0, width - cellWidth(prefix) - cellWidth(titleText) - cellWidth(suffix));
  return `${paint(prefix, 'frame', theme)}${styleText(titleText, 'tool', theme, { bold: true })}${paint(`${'─'.repeat(fill)}${suffix}`, 'frame', theme)}`;
}

function summaryRow(state, config, width, options) {
  const inner = Math.max(0, width - 4);
  const separator = ` ${paint('·', 'frame', options.theme)} `;
  const items = [];
  let used = 0;
  for (const key of config?.header ?? []) {
    const extra = items.length ? 3 : 0;
    const remaining = Math.max(1, inner - used - extra);
    const next = headerItem(key, state, options, remaining);
    if (!next) continue;
    const nextWidth = cellWidth(next);
    if (items.length && used + extra + nextWidth > inner) break;
    items.push(items.length === 0 && nextWidth > inner ? truncateCells(next, inner, '') : next);
    used += extra + Math.min(nextWidth, inner);
    if (used >= inner) break;
  }
  const text = truncateCells(items.join(separator), inner, '');
  return `${paint('│', 'frame', options.theme)} ${padCells(text, inner)} ${paint('│', 'frame', options.theme)}`;
}

function tableRow(cells, widths, theme) {
  const edge = paint('│', 'frame', theme);
  const body = cells.map((cell, index) => {
    const inner = Math.max(0, widths[index] - 2);
    return ` ${padCells(truncateCells(cell ?? '', inner, ''), inner)} `;
  }).join(edge);
  return `${edge}${body}${edge}`;
}

function internalBoundaries(widths = []) {
  const result = new Set();
  let cursor = 1;
  for (let index = 0; index < widths.length - 1; index += 1) {
    cursor += widths[index];
    result.add(cursor);
    cursor += 1;
  }
  return result;
}

function transitionBorder(width, aboveWidths, belowWidths, theme, { left = '├', right = '┤' } = {}) {
  const above = internalBoundaries(aboveWidths);
  const below = internalBoundaries(belowWidths);
  let line = left;
  for (let position = 1; position < width - 1; position += 1) {
    const hasAbove = above.has(position);
    const hasBelow = below.has(position);
    line += hasAbove && hasBelow ? '┼' : hasAbove ? '┴' : hasBelow ? '┬' : '─';
  }
  line += right;
  return paint(line, 'frame', theme);
}

function fullBottomBorder(width, theme) {
  return paint(`╰${'─'.repeat(Math.max(0, width - 2))}╯`, 'frame', theme);
}

function allocateWeightedWidths(width, cards) {
  const count = cards.length;
  if (count <= 0) return [];
  const total = Math.max(count, width - (count + 1));
  const weights = cards.map((card) => Math.max(0.1, Number(card.weight) || 1));
  const weightSum = weights.reduce((sum, item) => sum + item, 0);
  const raw = weights.map((weight) => (total * weight) / weightSum);
  const widths = raw.map((item) => Math.max(1, Math.floor(item)));
  let used = widths.reduce((sum, item) => sum + item, 0);
  const order = raw.map((item, index) => ({ index, fraction: item - Math.floor(item) }))
    .sort((a, b) => b.fraction - a.fraction);
  let cursor = 0;
  while (used < total) {
    widths[order[cursor % order.length].index] += 1;
    used += 1;
    cursor += 1;
  }
  while (used > total) {
    const candidate = widths.findIndex((item) => item > 1);
    if (candidate < 0) break;
    widths[candidate] -= 1;
    used -= 1;
  }
  return widths;
}

function columnCountFor(width, cardCount) {
  if (cardCount <= 0) return 0;
  return Math.max(1, Math.min(MAX_CARD_COLUMNS, cardCount, Math.floor(Math.max(1, width - 1) / MIN_CARD_OUTER_CELLS)));
}

function representationForWidth(innerWidth) {
  if (innerWidth >= 34) return CARD_REPRESENTATION.RICH;
  if (innerWidth >= 26) return CARD_REPRESENTATION.NORMAL;
  if (innerWidth >= 18) return CARD_REPRESENTATION.COMPACT;
  return CARD_REPRESENTATION.MINIMAL;
}

function cappedRepresentation(widthRep, capRep) {
  return RANK_REP[Math.min(REP_RANK[widthRep], REP_RANK[capRep])];
}

function blockHeight(rep) {
  if (rep === CARD_REPRESENTATION.RICH) return 5;
  if (rep === CARD_REPRESENTATION.NORMAL) return 4;
  if (rep === CARD_REPRESENTATION.COMPACT) return 3;
  return 1;
}

function monitorBudget(height) {
  const safe = Math.max(8, Number(height) || 24);
  return Math.max(3, Math.min(MAX_MONITOR_ROWS, safe - MIN_CHILD_ROWS));
}

function packCards(cards, columns, width, capRep) {
  const rows = [];
  for (let start = 0; start < cards.length; start += columns) {
    const rowCards = cards.slice(start, start + columns);
    const widths = allocateWeightedWidths(width, rowCards);
    const items = rowCards.map((card, index) => {
      const outerWidth = widths[index];
      const innerWidth = Math.max(1, outerWidth - 2);
      const widthRep = representationForWidth(innerWidth);
      const representation = cappedRepresentation(widthRep, capRep);
      return { card, outerWidth, innerWidth, representation };
    });
    rows.push({ cards: rowCards, widths, items, blockHeight: Math.max(...items.map((item) => blockHeight(item.representation))) });
  }
  return rows;
}

function estimatedFrameHeight(rows) {
  if (!rows.length) return 3;
  return 2 + rows.reduce((sum, row) => sum + 1 + row.blockHeight, 0) + 1;
}

function planGrid(cards, width, height) {
  const budget = monitorBudget(height);
  if (!cards.length) return { columns: 0, rows: [], budget, frameHeight: 3, heightConstrained: false, cap: CARD_REPRESENTATION.MINIMAL };

  let columns = columnCountFor(width, cards.length);
  let minimalRows = packCards(cards, columns, width, CARD_REPRESENTATION.MINIMAL);
  while (columns < cards.length && estimatedFrameHeight(minimalRows) > budget) {
    columns += 1;
    minimalRows = packCards(cards, columns, width, CARD_REPRESENTATION.MINIMAL);
  }

  for (const cap of [CARD_REPRESENTATION.RICH, CARD_REPRESENTATION.NORMAL, CARD_REPRESENTATION.COMPACT, CARD_REPRESENTATION.MINIMAL]) {
    const rows = packCards(cards, columns, width, cap);
    const frameHeight = estimatedFrameHeight(rows);
    if (frameHeight <= budget) return { columns, rows, budget, frameHeight, heightConstrained: false, cap };
  }

  return {
    columns,
    rows: minimalRows,
    budget,
    frameHeight: estimatedFrameHeight(minimalRows),
    heightConstrained: true,
    cap: CARD_REPRESENTATION.MINIMAL
  };
}

function quotaSnapshot(metric, label, nowMs) {
  const item = value(metric);
  const remaining = finite(item?.remainingPercent);
  const reset = item ? formatQuotaReset(item.resetsAtMs ?? item.resetsAt, nowMs) : null;
  return { label, remaining, reset };
}

function quotaToken(remaining) {
  return severityToken(quotaRemainingSeverity(remaining));
}

function quotaLine(metric, label, width, nowMs, theme, { bar = true } = {}) {
  const q = quotaSnapshot(metric, label, nowMs);
  const labelText = styleText(label.padEnd(4), 'text', theme, { bold: true });
  if (q.remaining == null) return `${labelText} ${styleText('waiting…', 'muted', theme)}`;
  const token = quotaToken(q.remaining);
  const resetText = q.reset ? ` ${paint('↻', 'frame', theme)} ${styleText(q.reset, 'muted', theme)}` : '';
  if (!bar) return `${labelText} ${styleText(`${Math.round(q.remaining)}% left`, token, theme, { bold: true })}${resetText}`;
  const resetCells = q.reset ? cellWidth(q.reset) + 3 : 0;
  const barCells = Math.max(6, Math.min(16, width - 4 - 11 - resetCells));
  const gauge = progressBar(q.remaining, barCells);
  return `${labelText} ${styleText(gauge, token, theme)} ${styleText(`${Math.round(q.remaining)}% left`, token, theme, { bold: true })}${resetText}`;
}

function contextContent(state, rep, width, theme) {
  const used = finite(value(state?.context?.usedTokens));
  const window = finite(value(state?.context?.windowTokens));
  const usedPercent = finite(value(state?.context?.usedPercent)) ?? (used != null && window != null && window > 0 ? (used / window) * 100 : null);
  const leftPercent = finite(value(state?.context?.leftPercent)) ?? (usedPercent == null ? null : 100 - usedPercent);
  const cached = value(state?.usage?.cachedInputTokens);
  const compaction = value(state?.compaction?.count);
  const turnsSince = finite(value(state?.compaction?.turnsSinceCompact));
  const token = severityToken(contextUsedSeverity(usedPercent));
  const summary = `${styleText(`${pct(usedPercent)} used`, token, theme, { bold: true })} ${paint('·', 'frame', theme)} ${fmtNumber(used)}/${fmtNumber(window)}`;

  if (rep === CARD_REPRESENTATION.MINIMAL) return [`${styleText(pct(usedPercent), token, theme, { bold: true })} ${paint('·', 'frame', theme)} ${fmtNumber(used)}/${fmtNumber(window)} ${paint('·', 'frame', theme)} left ${pct(leftPercent)}`];
  if (rep === CARD_REPRESENTATION.COMPACT) return [summary, `LEFT ${pct(leftPercent)} ${paint('·', 'frame', theme)} CACHE ${fmtNumber(cached)}`];
  if (rep === CARD_REPRESENTATION.NORMAL) {
    const gauge = progressBar(usedPercent, Math.min(16, Math.max(8, width - 2)));
    return [summary, styleText(gauge, token, theme), `CACHE ${fmtNumber(cached)} ${paint('·', 'frame', theme)} LEFT ${pct(leftPercent)} ${paint('·', 'frame', theme)} CMP ${fmtNumber(compaction)}`];
  }
  const gauge = progressBar(usedPercent, Math.min(20, Math.max(8, width - 2)));
  return [
    summary,
    styleText(gauge, token, theme),
    `CACHE ${styleText(fmtNumber(cached), 'info', theme)} ${paint('·', 'frame', theme)} LEFT ${pct(leftPercent)}`,
    `CMP ${styleText(fmtNumber(compaction), 'reasoning', theme)}${turnsSince == null ? '' : ` ${paint('·', 'frame', theme)} SINCE ${turnsSince}t`}`
  ];
}

function quotaCompactText(snapshot, label, theme) {
  if (snapshot.remaining == null) return `${label} --`;
  const token = quotaToken(snapshot.remaining);
  return `${label} ${styleText(`${Math.round(snapshot.remaining)}%`, token, theme, { bold: true })}`;
}

function usageContent(state, rep, width, theme, nowMs) {
  const auth = String(value(state?.auth?.mode, 'unknown'));
  const input = fmtNumber(value(state?.usage?.inputTokens));
  const cached = fmtNumber(value(state?.usage?.cachedInputTokens));
  const output = fmtNumber(value(state?.usage?.outputTokens));
  const reasoning = fmtNumber(value(state?.usage?.reasoningTokens));
  const turnInput = fmtNumber(value(state?.usage?.turnInputTokens));
  const turnOutput = fmtNumber(value(state?.usage?.turnOutputTokens));

  if (auth === 'login') {
    const five = quotaSnapshot(state?.quota?.fiveHour, '5H', nowMs);
    const week = quotaSnapshot(state?.quota?.weekly, 'WEEK', nowMs);
    const fiveShort = quotaCompactText(five, '5H', theme);
    const weekShort = quotaCompactText(week, 'W', theme);
    if (rep === CARD_REPRESENTATION.MINIMAL) return [`${fiveShort} ${paint('·', 'frame', theme)} ${weekShort} ${paint('·', 'frame', theme)} IN ${input} ${paint('·', 'frame', theme)} OUT ${output}`];
    if (rep === CARD_REPRESENTATION.COMPACT) return [
      `${fiveShort}${five.reset ? ` ↻ ${five.reset}` : ''} ${paint('·', 'frame', theme)} ${weekShort}${week.reset ? ` ↻ ${week.reset}` : ''}`,
      `IN ${input} ${paint('·', 'frame', theme)} CACHE ${cached} ${paint('·', 'frame', theme)} OUT ${output}`
    ];
    if (rep === CARD_REPRESENTATION.NORMAL) return [
      quotaLine(state?.quota?.fiveHour, '5H', width, nowMs, theme, { bar: width >= 28 }),
      quotaLine(state?.quota?.weekly, 'WEEK', width, nowMs, theme, { bar: width >= 28 }),
      `IN ${input} ${paint('·', 'frame', theme)} CACHE ${cached} ${paint('·', 'frame', theme)} OUT ${output}`
    ];
    return [
      quotaLine(state?.quota?.fiveHour, '5H', width, nowMs, theme, { bar: true }),
      quotaLine(state?.quota?.weekly, 'WEEK', width, nowMs, theme, { bar: true }),
      `IN ${input} ${paint('·', 'frame', theme)} CACHE ${cached} ${paint('·', 'frame', theme)} OUT ${output}`,
      `RSN ${reasoning} ${paint('·', 'frame', theme)} T.IN ${turnInput} ${paint('·', 'frame', theme)} T.OUT ${turnOutput}`
    ];
  }

  const requested = String(value(state?.model?.requested, '--'));
  const actual = String(value(state?.model?.actual, 'waiting…'));
  if (rep === CARD_REPRESENTATION.MINIMAL) return [`IN ${input} ${paint('·', 'frame', theme)} OUT ${output} ${paint('·', 'frame', theme)} ${requested}`];
  if (rep === CARD_REPRESENTATION.COMPACT) return [
    `MODEL ${requested} ${paint('·', 'frame', theme)} RSN ${String(value(state?.model?.reasoning, '--'))}`,
    `IN ${input} ${paint('·', 'frame', theme)} CACHE ${cached} ${paint('·', 'frame', theme)} OUT ${output}`
  ];
  if (rep === CARD_REPRESENTATION.NORMAL) return [
    `MODEL ${styleText(requested, 'thinking', theme, { bold: true })} ${paint('·', 'frame', theme)} ACTUAL ${actual}`,
    `IN ${input} ${paint('·', 'frame', theme)} CACHE ${cached} ${paint('·', 'frame', theme)} OUT ${output}`,
    `RSN ${reasoning} ${paint('·', 'frame', theme)} T.IN ${turnInput} ${paint('·', 'frame', theme)} T.OUT ${turnOutput}`
  ];
  return [
    `MODEL ${styleText(requested, 'thinking', theme, { bold: true })}`,
    `ACTUAL ${actual}`,
    `IN ${input} ${paint('·', 'frame', theme)} CACHE ${cached} ${paint('·', 'frame', theme)} OUT ${output}`,
    `RSN ${reasoning} ${paint('·', 'frame', theme)} T.IN ${turnInput} ${paint('·', 'frame', theme)} T.OUT ${turnOutput}`
  ];
}

function sessionContent(state, rep, theme, nowMs) {
  const elapsed = fmtDuration(Math.max(0, nowMs - (state?.run?.startedAtMs ?? nowMs)));
  const turns = fmtNumber(value(state?.session?.turnCount));
  const last = fmtDuration(value(state?.session?.lastTurnDurationMs));
  const update = fmtAge(value(state?.session?.lastEventAtMs), nowMs);
  const thread = String(value(state?.session?.threadId, '--')).slice(0, 12);
  const freshness = state?.session?.lastEventAtMs?.freshness ?? 'waiting';
  const bound = Boolean(value(state?.session?.bound, false));
  const data = bound ? 'current' : 'waiting';

  if (rep === CARD_REPRESENTATION.MINIMAL) return [`${turns}t ${paint('·', 'frame', theme)} ${thread} ${paint('·', 'frame', theme)} ${data}`];
  if (rep === CARD_REPRESENTATION.COMPACT) return [
    `turns ${turns} ${paint('·', 'frame', theme)} elapsed ${elapsed}`,
    `thread ${thread} ${paint('·', 'frame', theme)} ${data}`
  ];
  if (rep === CARD_REPRESENTATION.NORMAL) return [
    `elapsed ${elapsed} ${paint('·', 'frame', theme)} turns ${turns}`,
    `last ${last} ${paint('·', 'frame', theme)} update ${update}`,
    `thread ${thread} ${paint('·', 'frame', theme)} fresh ${freshness} ${paint('·', 'frame', theme)} ${data}`
  ];
  return [
    `elapsed ${elapsed} ${paint('·', 'frame', theme)} turns ${turns}`,
    `last ${last} ${paint('·', 'frame', theme)} update ${update}`,
    `thread ${styleText(thread, 'info', theme)} ${paint('·', 'frame', theme)} fresh ${freshness}`,
    `data ${bound ? styleText('current rollout', 'healthy', theme) : styleText('waiting', 'approval', theme)}`
  ];
}

function activityContent(state, rep, theme) {
  const info = activityInfo(state);
  const detail = String(value(state?.activity?.detail, info.detail) || info.detail);
  const source = String(value(state?.activity?.source, 'runtime'));
  const activeTools = value(state?.activity?.activeTools, []);
  const currentTool = value(state?.tools?.current, null);
  const lastTool = value(state?.tools?.last, null);
  const tool = currentTool ?? lastTool;
  const toolName = tool?.name ?? tool?.tool ?? '--';
  const approval = Boolean(value(state?.activity?.approvalPending, false));
  const retry = fmtNumber(value(state?.activity?.retryCount));
  const errors = fmtNumber(value(state?.activity?.errorCount));
  const status = `${styleText(`${info.symbol} ${info.activity}`, info.token, theme, { bold: true })} ${detail}`;

  if (rep === CARD_REPRESENTATION.MINIMAL) return [`${info.symbol} ${info.activity} ${paint('·', 'frame', theme)} tools ${Array.isArray(activeTools) ? activeTools.length : '--'}${approval ? ' · approval' : ''}`];
  if (rep === CARD_REPRESENTATION.COMPACT) return [status, `tools ${Array.isArray(activeTools) ? activeTools.length : '--'} ${paint('·', 'frame', theme)} ${currentTool ? 'current' : 'last'} ${toolName}`];
  if (rep === CARD_REPRESENTATION.NORMAL) return [status, `source ${source}`, `tools ${Array.isArray(activeTools) ? activeTools.length : '--'} ${paint('·', 'frame', theme)} ${currentTool ? 'current' : 'last'} ${toolName} ${paint('·', 'frame', theme)} approval ${approval}`];
  return [
    status,
    `source ${source}`,
    `tools ${Array.isArray(activeTools) ? activeTools.length : '--'} ${paint('·', 'frame', theme)} ${currentTool ? 'current' : 'last'} ${toolName}`,
    `approval ${approval} ${paint('·', 'frame', theme)} retry ${retry} ${paint('·', 'frame', theme)} err ${errors}`
  ];
}

function systemGraph(state, key, width) {
  const samples = Array.isArray(value(state?.system?.samples, [])) ? value(state?.system?.samples, []) : [];
  if (key === 'cpu') return sparkline(samples.map((sample) => sample?.cpuPercent), Math.max(4, width));
  return sparkline(samples.map((sample) => {
    const used = finite(sample?.memoryBytes);
    const total = finite(sample?.totalMemoryBytes);
    return used != null && total != null && total > 0 ? (used / total) * 100 : null;
  }), Math.max(4, width));
}

function pressureText(label, raw, graph, theme) {
  const token = severityToken(systemPressureSeverity(raw));
  const percent = styleText(pct(raw), token, theme, { bold: true });
  return graph ? `${label} ${percent}  ${styleText(graph, token, theme)}` : `${label} ${percent}`;
}

function systemContent(state, rep, width, theme) {
  const cpu = finite(value(state?.system?.cpuPercent));
  const used = finite(value(state?.system?.memoryBytes));
  const total = finite(value(state?.system?.totalMemoryBytes));
  const memoryPercent = used != null && total != null && total > 0 ? (used / total) * 100 : null;
  const graphWidth = Math.max(4, Math.min(20, width - 11));
  const cpuGraph = width >= 24 ? systemGraph(state, 'cpu', graphWidth) : null;
  const ramGraph = width >= 24 ? systemGraph(state, 'ram', graphWidth) : null;
  const cpuLine = pressureText('CPU', cpu, cpuGraph, theme);
  const ramLine = pressureText('RAM', memoryPercent, ramGraph, theme);
  const cpuToken = severityToken(systemPressureSeverity(cpu));
  const ramToken = severityToken(systemPressureSeverity(memoryPercent));
  const capacityLine = `USED ${formatBytes(used)} ${paint('·', 'frame', theme)} TOTAL ${formatBytes(total)}`;

  if (rep === CARD_REPRESENTATION.MINIMAL) return [`CPU ${styleText(pct(cpu), cpuToken, theme, { bold: true })} ${paint('·', 'frame', theme)} RAM ${styleText(pct(memoryPercent), ramToken, theme, { bold: true })}`];
  if (rep === CARD_REPRESENTATION.COMPACT) return [`CPU ${styleText(pct(cpu), cpuToken, theme, { bold: true })} ${paint('·', 'frame', theme)} RAM ${styleText(pct(memoryPercent), ramToken, theme, { bold: true })}`, capacityLine];
  return [cpuLine, ramLine, capacityLine];
}

function enabledCards(config, state) {
  const auth = String(value(state?.auth?.mode, 'unknown'));
  const cards = [];
  if (config?.sections?.context === true && config?.metrics?.context !== false) cards.push({ id: 'context', title: 'CONTEXT', token: 'info', weight: 0.85 });
  if (config?.sections?.usage === true && config?.metrics?.usage !== false) cards.push({ id: 'usage', title: `USAGE${auth === 'login' ? ' · LOGIN' : auth === 'api' ? ' · API' : ''}`, token: 'reasoning', weight: auth === 'login' ? 1.25 : 1.15 });
  if (config?.sections?.session === true && config?.metrics?.session !== false) cards.push({ id: 'session', title: 'SESSION', token: 'healthy', weight: 1.0 });
  if (config?.sections?.activity === true && config?.metrics?.activity !== false) cards.push({ id: 'activity', title: 'CURRENT ACTIVITY', token: 'thinking', weight: 1.05 });
  if (config?.sections?.system === true && config?.metrics?.system !== false) cards.push({ id: 'system', title: 'SYSTEM', token: 'info', weight: 0.95 });
  return cards;
}

function cardContent(item, state, theme, nowMs) {
  const { card, representation, innerWidth } = item;
  if (card.id === 'context') return contextContent(state, representation, innerWidth, theme);
  if (card.id === 'usage') return usageContent(state, representation, innerWidth, theme, nowMs);
  if (card.id === 'session') return sessionContent(state, representation, theme, nowMs);
  if (card.id === 'activity') return activityContent(state, representation, theme);
  if (card.id === 'system') return systemContent(state, representation, innerWidth, theme);
  return ['--'];
}

function cardBlock(item, state, theme, nowMs) {
  const content = cardContent(item, state, theme, nowMs);
  const title = styleText(item.card.title, item.card.token, theme, { bold: true });
  if (item.representation === CARD_REPRESENTATION.MINIMAL) {
    return [`${title} ${paint('·', 'frame', theme)} ${content[0] ?? '--'}`];
  }
  return [title, ...content];
}

function constrainedFrame({ state, config, width, options, cards, theme, plan }) {
  const names = cards.map((card) => card.title.replace('CURRENT ', '')).join(' · ');
  const lines = [
    topBorder(width, config?.preset, theme),
    summaryRow(state, config, width, options),
    `${paint('│', 'frame', theme)} ${padCells(truncateCells(names, Math.max(0, width - 4), ''), Math.max(0, width - 4))} ${paint('│', 'frame', theme)}`,
    fullBottomBorder(width, theme)
  ].slice(0, plan.budget);
  return lines;
}

function responsiveCardFrame({
  state,
  config,
  width = 80,
  height = 24,
  cwd = process.cwd(),
  nowMs = Date.now(),
  projectName = null,
  health = null,
  gitLabel = null,
  fast = false
} = {}) {
  const safeWidth = Math.max(20, Number(width) || 80);
  const safeHeight = Math.max(8, Number(height) || 24);
  const theme = config?.theme ?? 'color';
  const options = { theme, cwd, nowMs, projectName, health, gitLabel, fast };
  const cards = enabledCards(config, state);
  const plan = planGrid(cards, safeWidth, safeHeight);

  let lines;
  if (plan.heightConstrained) {
    lines = constrainedFrame({ state, config, width: safeWidth, options, cards, theme, plan });
  } else {
    lines = [topBorder(safeWidth, config?.preset, theme), summaryRow(state, config, safeWidth, options)];
    let previousWidths = [];
    for (const row of plan.rows) {
      lines.push(transitionBorder(safeWidth, previousWidths, row.widths, theme));
      const blocks = row.items.map((item) => cardBlock(item, state, theme, nowMs));
      const blockRows = Math.max(...blocks.map((block) => block.length));
      for (let index = 0; index < blockRows; index += 1) {
        lines.push(tableRow(blocks.map((block) => block[index] ?? ''), row.widths, theme));
      }
      previousWidths = row.widths;
    }
    if (plan.rows.length) lines.push(transitionBorder(safeWidth, previousWidths, [], theme, { left: '╰', right: '╯' }));
    else lines.push(fullBottomBorder(safeWidth, theme));
  }

  const representations = {};
  for (const row of plan.rows) for (const item of row.items) representations[item.card.id] = item.representation;
  return {
    lines: lines.map((line) => truncateCells(line, safeWidth, '')),
    rowCount: lines.length,
    layout: {
      laneCount: plan.columns || 1,
      columns: plan.columns,
      gridRows: plan.rows.length,
      cardCount: cards.length,
      responsiveCards: true
    },
    semantic: {
      activeTab: 'overview',
      authMode: value(state?.auth?.mode, 'unknown'),
      theme,
      interactive: false,
      visual: 'responsive-card-grid-v3',
      cardGrid: true,
      cardCount: cards.length,
      columns: plan.columns,
      representationCap: plan.cap,
      representations,
      progressiveGraphs: true,
      systemCard: cards.some((card) => card.id === 'system'),
      heightConstrained: plan.heightConstrained
    }
  };
}

export function buildLiveFrame(options = {}) {
  return responsiveCardFrame(options);
}

export {
  assertNoWrap,
  formatBytes,
  formatQuotaReset,
  ULTRAWIDE_SYSTEM_CARD_MIN_CELLS,
  MIN_SPARKLINE_SAMPLES,
  MIN_CARD_OUTER_CELLS,
  CARD_REPRESENTATION,
  sparkline,
  progressBar,
  columnCountFor,
  planGrid
};