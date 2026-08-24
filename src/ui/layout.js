import { cellWidth, truncateCells } from './cell-width.js';

export const SECTION_TYPES = Object.freeze({ REGULAR: 'REGULAR', SMALL: 'SMALL', INLINE: 'INLINE' });
export const REPRESENTATION = Object.freeze({ FULL: 'FULL', COMPACT: 'COMPACT', MICRO: 'MICRO', HIDDEN: 'HIDDEN' });

const HEIGHT_BUDGETS = Object.freeze([
  { min: 35, rows: 7 },
  { min: 24, rows: 5 },
  { min: 18, rows: 4 },
  { min: 0, rows: 3 }
]);

export function monitorRowBudget(height = 24) {
  const safe = Math.max(8, Number(height) || 24);
  return HEIGHT_BUDGETS.find((item) => safe >= item.min)?.rows ?? 3;
}

export function representationForWidth(width, section) {
  const minWidth = Math.max(1, section.minWidth ?? 18);
  const preferred = Math.max(minWidth, section.preferredWidth ?? minWidth + 10);
  if (width >= preferred) return REPRESENTATION.FULL;
  if (width >= minWidth) return REPRESENTATION.COMPACT;
  if (width >= Math.max(8, Math.floor(minWidth * 0.55))) return REPRESENTATION.MICRO;
  return REPRESENTATION.HIDDEN;
}

export function laneThresholds(sections = []) {
  if (!sections.length) return { two: Number.POSITIVE_INFINITY, three: Number.POSITIVE_INFINITY };
  const preferred = Math.max(...sections.map((item) => item.preferredWidth ?? 28));
  return { two: preferred * 2 + 2, three: preferred * 3 + 4 };
}

export function laneCountFor(width, sections = [], {
  previousLaneCount = null,
  hysteresisCells = 4
} = {}) {
  if (!sections.length) return 1;
  const safeWidth = Math.max(20, Number(width) || 80);
  const thresholds = laneThresholds(sections);
  const margin = Math.max(0, Number(hysteresisCells) || 0);
  const previous = [1, 2, 3].includes(previousLaneCount) ? previousLaneCount : null;

  if (previous === 1) {
    if (safeWidth >= thresholds.three + margin) return 3;
    if (safeWidth >= thresholds.two + margin) return 2;
    return 1;
  }
  if (previous === 2) {
    if (safeWidth >= thresholds.three + margin) return 3;
    if (safeWidth < thresholds.two - margin) return 1;
    return 2;
  }
  if (previous === 3) {
    if (safeWidth < thresholds.two - margin) return 1;
    if (safeWidth < thresholds.three - margin) return 2;
    return 3;
  }

  if (safeWidth >= thresholds.three) return 3;
  if (safeWidth >= thresholds.two) return 2;
  return 1;
}

function allocateLaneWidths(width, laneCount) {
  const safeLaneCount = Math.max(1, Math.min(3, Number(laneCount) || 1));
  const gap = safeLaneCount - 1;
  const usable = Math.max(safeLaneCount, width - gap);
  const base = Math.floor(usable / safeLaneCount);
  const remainder = usable - base * safeLaneCount;
  return Array.from({ length: safeLaneCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function layoutSections(sections = [], {
  width = 80,
  height = 24,
  maxRows = monitorRowBudget(height),
  previousLaneCount = null,
  hysteresisCells = 4
} = {}) {
  const safeWidth = Math.max(20, Number(width) || 80);
  const safeMaxRows = Math.max(1, Number(maxRows) || 1);
  const visible = sections.filter((item) => item?.enabled !== false)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const laneCount = laneCountFor(safeWidth, visible, { previousLaneCount, hysteresisCells });
  const laneWidths = allocateLaneWidths(safeWidth, laneCount);
  const lanes = Array.from({ length: laneCount }, (_, index) => ({ index, width: laneWidths[index], rows: 0, items: [] }));

  for (const section of visible) {
    const candidates = lanes
      .map((lane) => ({ lane, rep: representationForWidth(lane.width, section) }))
      .filter((item) => item.rep !== REPRESENTATION.HIDDEN)
      .sort((a, b) => a.lane.rows - b.lane.rows);
    if (!candidates.length) continue;
    const selected = candidates[0];
    const heightCost = selected.rep === REPRESENTATION.FULL
      ? Math.max(1, section.estimatedHeight ?? 2)
      : 1;
    if (selected.lane.rows + heightCost > safeMaxRows) {
      const micro = representationForWidth(selected.lane.width, {
        ...section,
        minWidth: Math.max(8, Math.floor((section.minWidth ?? 18) * 0.55)),
        preferredWidth: Number.MAX_SAFE_INTEGER
      });
      if (micro === REPRESENTATION.HIDDEN || selected.lane.rows + 1 > safeMaxRows) continue;
      selected.lane.items.push({ ...section, representation: REPRESENTATION.MICRO, width: selected.lane.width });
      selected.lane.rows += 1;
      continue;
    }
    selected.lane.items.push({ ...section, representation: selected.rep, width: selected.lane.width });
    selected.lane.rows += heightCost;
  }

  return {
    width: safeWidth,
    height: Math.max(8, Number(height) || 24),
    maxRows: safeMaxRows,
    laneCount,
    lanes,
    hysteresis: { previousLaneCount, hysteresisCells: Math.max(0, Number(hysteresisCells) || 0) }
  };
}

export function fitHeader({ left = [], tabs = [], width = 80, activeTab = 'overview' } = {}) {
  const safeWidth = Math.max(20, Number(width) || 80);
  const fullTabs = tabs.map((tab) => tab === activeTab ? `[${tab}]` : tab);
  const compactName = (name) => ({ overview: 'Ov', performance: 'Perf', processes: 'Proc', resources: 'Res', usage: 'Use', tools: 'Tools' }[name] ?? name.slice(0, 4));
  const compactTabs = tabs.map((tab) => tab === activeTab ? `[${compactName(tab)}]` : compactName(tab));

  let nav = fullTabs.join(' ');
  if (cellWidth(nav) > Math.floor(safeWidth * 0.58)) nav = compactTabs.join(' ');
  if (cellWidth(nav) > safeWidth - 8) {
    const active = compactName(activeTab ?? tabs[0] ?? 'overview');
    nav = `${active} ›`;
  }

  const divider = ' │ ';
  const navWidth = cellWidth(nav);
  const leftBudget = Math.max(0, safeWidth - navWidth - cellWidth(divider));
  const kept = [];
  for (const item of left) {
    const candidate = [...kept, item].join('  ');
    if (cellWidth(candidate) <= leftBudget) kept.push(item);
    else break;
  }
  const leftText = kept.length ? kept.join('  ') : '';
  const separator = leftText && nav ? divider : '';
  return truncateCells(`${leftText}${separator}${nav}`, safeWidth, '');
}
