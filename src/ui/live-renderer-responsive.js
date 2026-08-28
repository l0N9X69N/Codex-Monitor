import {
  buildLiveFrame as buildLegacyFrame,
  balancedColumnCountFor,
  formatBytes,
  planGrid,
  progressBar
} from './live-renderer-responsive-legacy.js';
import { cellWidth, padCells, stripAnsi, truncateCells } from './cell-width.js';
import { styleText } from './theme.js';
import { severityToken, systemPressureSeverity } from './severity.js';

export * from './live-renderer-responsive-legacy.js';

// Automatic SYSTEM telemetry is optional. It must never make the four primary
// cards unreadable just because a fifth card technically fits in the grid.
// Explicit `on` remains the forced override chosen by the user.
export const SYSTEM_CARD_MIN_OUTER_CELLS = 44;

function value(metric, fallback = null) {
  if (metric && typeof metric === 'object' && Object.prototype.hasOwnProperty.call(metric, 'value')) return metric.value ?? fallback;
  return metric ?? fallback;
}

function finite(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function pct(raw) {
  const n = finite(raw);
  return n == null ? '--' : `${Math.round(n)}%`;
}

function cloneConfig(config = {}) {
  return {
    ...config,
    sections: { ...(config.sections ?? {}) },
    metrics: { ...(config.metrics ?? {}) },
    fields: {
      ...(config.fields ?? {}),
      system: { ...(config.fields?.system ?? {}) }
    }
  };
}

function coreCards(config, state) {
  const auth = String(value(state?.auth?.mode, 'unknown'));
  const cards = [];
  if (config?.sections?.context === true && config?.metrics?.context !== false) cards.push({ id: 'context', title: 'CONTEXT', token: 'info', weight: 0.85 });
  if (config?.sections?.usage === true && config?.metrics?.usage !== false) cards.push({ id: 'usage', title: `USAGE${auth === 'login' ? ' · LOGIN' : auth === 'api' ? ' · API' : ''}`, token: 'reasoning', weight: auth === 'login' ? 1.25 : 1.15 });
  if (config?.sections?.session === true && config?.metrics?.session !== false) cards.push({ id: 'session', title: 'SESSION', token: 'healthy', weight: 1.0 });
  if (config?.sections?.activity === true && config?.metrics?.activity !== false) cards.push({ id: 'activity', title: 'CURRENT ACTIVITY', token: 'thinking', weight: 1.05 });
  return cards;
}

function cardsWithRequestedSystem(config, state) {
  const cards = coreCards(config, state);
  const systemMode = String(config?.systemMode ?? (config?.sections?.system === true ? 'on' : 'off'));
  if (systemMode !== 'off' && config?.metrics?.system !== false) {
    cards.push({ id: 'system', title: 'SYSTEM', token: 'info', weight: 0.95 });
  }
  const beastMode = String(config?.beastMode ?? 'off');
  if (beastMode === 'on') cards.push({ id: 'beast', title: 'BEAST MODE', token: 'tool', weight: 1.0 });
  return cards;
}

function systemLayoutDecision(config, state, width, height) {
  const mode = String(config?.systemMode ?? (config?.sections?.system === true ? 'on' : 'off'));
  if (mode === 'off' || config?.metrics?.system === false) return { visible: false, mode, reason: 'disabled' };

  const cards = cardsWithRequestedSystem(config, state);
  const systemIndex = cards.findIndex((card) => card.id === 'system');
  if (systemIndex < 0) return { visible: false, mode, reason: 'disabled' };

  // Explicit On is the user's forced override. Keep the legacy responsive
  // behavior, including a second row or compact representation if necessary.
  if (mode === 'on') return { visible: true, mode, reason: 'forced-on' };

  // Use a generous height here: auto visibility is a horizontal-layout
  // decision. Actual height degradation still belongs to the base renderer.
  const widthPlan = planGrid(cards, width, Math.max(50, Number(height) || 24));
  let systemItem = null;
  for (const row of widthPlan.rows) {
    const found = row.items.find((item) => item.card.id === 'system');
    if (found) {
      systemItem = found;
      break;
    }
  }

  if (!systemItem || systemItem.outerWidth < SYSTEM_CARD_MIN_OUTER_CELLS) {
    return { visible: false, mode, reason: 'below-min-width', outerWidth: systemItem?.outerWidth ?? 0 };
  }

  const columns = balancedColumnCountFor(width, cards.length);
  if (columns !== cards.length || widthPlan.rows.length !== 1) {
    return { visible: false, mode, reason: 'auto-needs-one-row', outerWidth: systemItem.outerWidth };
  }

  return { visible: true, mode, reason: 'fits', outerWidth: systemItem.outerWidth };
}

function effectiveConfigForWidth(config, state, width, height) {
  const decision = systemLayoutDecision(config, state, width, height);
  if (decision.visible) return { config, decision };

  const next = cloneConfig(config);
  next.systemMode = 'off';
  next.sections.system = false;
  return { config: next, decision };
}

function rawIndexAtCell(text, targetCell) {
  const source = String(text ?? '');
  const target = Math.max(0, Number(targetCell) || 0);
  let index = 0;
  let cells = 0;

  while (index < source.length && cells < target) {
    if (source.charCodeAt(index) === 0x1b && source[index + 1] === '[') {
      const match = source.slice(index).match(/^\x1b\[[0-?]*[ -\/]*[@-~]/);
      if (match) {
        index += match[0].length;
        continue;
      }
    }
    const codePoint = source.codePointAt(index);
    const char = String.fromCodePoint(codePoint);
    const width = cellWidth(char);
    if (cells + width > target) break;
    cells += width;
    index += char.length;
  }

  return index;
}

function replaceCellSpan(line, startCell, width, content) {
  const start = rawIndexAtCell(line, startCell);
  const end = rawIndexAtCell(line, startCell + width);
  const fitted = padCells(truncateCells(content, width, ''), width);
  return `${line.slice(0, start)}${fitted}${line.slice(end)}`;
}

function gaugeLine(label, percent, barCells, theme, suffix = '') {
  const token = severityToken(systemPressureSeverity(percent));
  const labelText = styleText(String(label).padEnd(4), 'text', theme, { bold: true });
  const percentText = styleText(pct(percent), token, theme, { bold: true });
  const gauge = progressBar(percent, barCells);
  const gaugeText = gauge ? styleText(gauge, token, theme) : styleText('--', 'muted', theme);
  return `${labelText} ${gaugeText} ${percentText}${suffix}`;
}

function systemGaugeLines(state, innerWidth, theme) {
  const cpu = finite(value(state?.system?.cpuPercent));
  const used = finite(value(state?.system?.memoryBytes));
  const total = finite(value(state?.system?.totalMemoryBytes));
  const ram = used != null && total != null && total > 0 ? (used / total) * 100 : null;
  const capacity = `${formatBytes(used)}/${formatBytes(total)}`;
  const capacitySuffix = ` · ${capacity}`;
  const percentCells = Math.max(cellWidth(pct(cpu)), cellWidth(pct(ram)), 3);
  const fixedCells = 4 + 1 + 1 + percentCells + cellWidth(capacitySuffix);
  const barCells = Math.max(6, Math.min(16, innerWidth - fixedCells));

  return [
    gaugeLine('CPU', cpu, barCells, theme),
    gaugeLine('RAM', ram, barCells, theme),
    gaugeLine('USED', ram, barCells, theme, styleText(capacitySuffix, 'muted', theme))
  ];
}

function rewriteSystemDashboard(frame, state, config, width, height) {
  // Only automatic System uses the compact quota-style dashboard. Forced On
  // intentionally preserves the richer legacy System presentation.
  if (String(config?.systemMode ?? 'off') !== 'auto') return frame;
  if (!frame?.semantic?.systemVisible) return frame;
  const fields = config?.fields?.system;
  if (fields && (fields.cpu === false || fields.ram === false || fields.ramCapacity === false)) return frame;

  const cards = cardsWithRequestedSystem(config, state);
  const plan = planGrid(cards, width, height);
  let systemRow = null;
  let systemColumn = -1;

  for (const row of plan.rows) {
    const index = row.items.findIndex((item) => item.card.id === 'system');
    if (index >= 0) {
      systemRow = row;
      systemColumn = index;
      break;
    }
  }
  if (!systemRow || systemColumn < 0) return frame;

  const outerWidth = systemRow.widths[systemColumn];
  if (outerWidth < SYSTEM_CARD_MIN_OUTER_CELLS) return frame;
  const segmentStart = 1 + systemRow.widths.slice(0, systemColumn).reduce((sum, item) => sum + item + 1, 0);
  const titleLine = frame.lines.findIndex((line) => /\bSYSTEM\b/.test(stripAnsi(line)));
  if (titleLine < 0) return frame;

  const lines = [...frame.lines];
  const dashboard = systemGaugeLines(state, Math.max(1, outerWidth - 2), config?.theme ?? 'color');
  for (let index = 0; index < dashboard.length; index += 1) {
    const lineIndex = titleLine + 1 + index;
    if (lineIndex >= lines.length) break;
    const plain = stripAnsi(lines[lineIndex]);
    if (/^[╰├┼┬┴─]/.test(plain.trimStart())) break;
    const cell = ` ${padCells(truncateCells(dashboard[index], Math.max(0, outerWidth - 2), ''), Math.max(0, outerWidth - 2))} `;
    lines[lineIndex] = replaceCellSpan(lines[lineIndex], segmentStart, outerWidth, cell);
  }

  return { ...frame, lines };
}

export function buildLiveFrame(options = {}) {
  const width = Math.max(20, Number(options.width) || 80);
  const height = Math.max(8, Number(options.height) || 24);
  const requestedConfig = options.config ?? {};
  const { config, decision } = effectiveConfigForWidth(requestedConfig, options.state, width, height);
  let frame = buildLegacyFrame({ ...options, config, width, height });
  frame = rewriteSystemDashboard(frame, options.state, config, width, height);

  return {
    ...frame,
    semantic: {
      ...frame.semantic,
      systemMode: String(requestedConfig?.systemMode ?? 'off'),
      systemMinOuterCells: SYSTEM_CARD_MIN_OUTER_CELLS,
      systemWidthDecision: decision.reason,
      systemRequested: String(requestedConfig?.systemMode ?? 'off') !== 'off'
    }
  };
}
