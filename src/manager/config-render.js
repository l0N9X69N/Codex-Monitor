import { hpaint } from '../history/theme.js';
import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { MANAGER_CONFIG_TABS, MANAGER_CONFIG_TAB_LABELS } from './config-controller.js';

function padLine(text, width) {
  return truncateCells(String(text ?? ''), width, '');
}

function rowStem(row) {
  if (row.kind === 'toggle') return `[${row.checked ? 'x' : ' '}] ${row.label}`;
  return `${row.label}  ${row.value}`;
}

function descriptionStemWidth(rows, width) {
  const stems = rows.filter((row) => row?.description).map((row) => cellWidth(rowStem(row)));
  if (!stems.length) return 0;
  const widest = Math.max(...stems);
  const descriptionReserve = width >= 80 ? 34 : 18;
  const maxStem = Math.max(10, width - 4 - descriptionReserve);
  return Math.max(10, Math.min(widest, maxStem));
}

function renderRow(row, selected, width, mode, stemWidth) {
  const prefix = selected ? '▸ ' : '  ';
  const rawStem = rowStem(row);
  const hasDescription = Boolean(row.description);
  const visibleStem = hasDescription && stemWidth > 0
    ? padCells(truncateCells(rawStem, stemWidth, '…'), stemWidth)
    : rawStem;
  const description = hasDescription ? `  (${row.description})` : '';
  const readOnly = row.editable ? '' : ' · read-only';

  if (selected) {
    const plain = `${prefix}${visibleStem}${description}${readOnly}`;
    return hpaint(padCells(truncateCells(plain, width, '…'), width), 'selected', mode);
  }

  const stemToken = !row.editable
    ? 'dim'
    : row.kind === 'toggle' && row.checked
      ? 'strong'
      : 'text';
  let text = `${prefix}${hpaint(visibleStem, stemToken, mode)}`;
  if (hasDescription) text += `  ${hpaint(`(${row.description})`, 'dim', mode)}`;
  if (!row.editable) text += hpaint(' · read-only', 'dim', mode);
  return truncateCells(text, width, '…');
}

export function renderManagerConfig({
  controller,
  width = 120,
  height = 36,
  mode = 'mono'
} = {}) {
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const rows = controller?.rows?.() ?? [];
  const cursorIndex = Math.max(0, Math.min(rows.length - 1, Number(controller?.cursorIndex) || 0));
  const stemWidth = descriptionStemWidth(rows, safeWidth - 2);
  const tabs = MANAGER_CONFIG_TABS.map((tab) => {
    const label = MANAGER_CONFIG_TAB_LABELS[tab] ?? tab;
    return tab === controller?.activeTab ? hpaint(`[${label}]`, 'nav', mode) : hpaint(label, 'dim', mode);
  }).join('  ');

  const lines = [
    padLine(hpaint('CODEX MONITOR · CONFIG', 'heading', mode), safeWidth),
    padLine(tabs, safeWidth),
    padLine(hpaint('─'.repeat(Math.max(0, safeWidth)), 'grid', mode), safeWidth),
    padLine(`${controller?.activeTabLabel ?? 'Config'}${controller?.dirty ? ` ${hpaint('· UNSAVED', 'pressure', mode)}` : ''}`, safeWidth),
    ''
  ];

  const bodyBudget = Math.max(3, safeHeight - 9);
  const start = Math.max(0, Math.min(cursorIndex - Math.floor(bodyBudget / 2), Math.max(0, rows.length - bodyBudget)));
  const visible = rows.slice(start, start + bodyBudget);
  for (let index = 0; index < visible.length; index += 1) {
    const row = visible[index];
    const absoluteIndex = start + index;
    lines.push(renderRow(row, absoluteIndex === cursorIndex, safeWidth, mode, stemWidth));
  }

  while (lines.length < safeHeight - 3) lines.push('');
  if (controller?.status) lines.push(padLine(hpaint(controller.status, controller.status.startsWith('Save failed') ? 'error' : 'secondary', mode), safeWidth));
  else lines.push('');
  lines.push(padLine(hpaint('Tab/←/→ tabs · ↑/↓ select · Enter/Space change · P Live preview · M Manager preview', 'dim', mode), safeWidth));
  lines.push(padLine(hpaint('S save · R revert · Esc/Q back · Archive lifecycle changes run only after Save.', 'dim', mode), safeWidth));

  return {
    lines: lines.slice(0, safeHeight),
    rows,
    cursorIndex,
    activeTab: controller?.activeTab ?? null,
    dirty: Boolean(controller?.dirty)
  };
}
