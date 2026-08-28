import { configText } from '../config/i18n.js';
import { hpaint } from '../history/theme.js';
import { cellWidth, padCells, truncateCells } from '../ui/cell-width.js';
import { MANAGER_CONFIG_TABS, MANAGER_CONFIG_TAB_LABELS } from './config-controller.js';

const CONFIG_HINT_KEY_TOKENS = Object.freeze({
  'Tab/←/→': 'cyberCyan',
  '↑/↓': 'cyberCyan',
  'Enter/Space': 'cyberCyan',
  P: 'cyberGreen',
  M: 'cyberMagenta',
  S: 'cyberGreen',
  R: 'cyberAmber',
  'Esc/Q': 'cyberMagenta'
});

function padLine(text, width) {
  return truncateCells(String(text ?? ''), width, '');
}

function localizedRow(row, language) {
  return {
    ...row,
    // Config mirrors the canonical English vocabulary used by the real Live
    // HUD and schema. Vietnamese is explanatory: descriptions and guidance
    // are localized, while setting names and technical values stay stable.
    label: row?.label,
    value: row?.value,
    description: configText(row?.description, language)
  };
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
  if (!row.editable) text += hpaint(readOnly, 'dim', mode);
  return truncateCells(text, width, '…');
}

function renderHintLine(text, mode) {
  const segments = String(text ?? '').split(' · ');
  return segments.map((segment) => {
    const splitAt = segment.indexOf(' ');
    const key = splitAt >= 0 ? segment.slice(0, splitAt) : segment;
    const description = splitAt >= 0 ? segment.slice(splitAt + 1) : '';
    const keyToken = CONFIG_HINT_KEY_TOKENS[key];
    if (!keyToken) return hpaint(segment, 'text', mode);
    const paintedKey = hpaint(key, keyToken, mode);
    return description ? `${paintedKey} ${hpaint(description, 'text', mode)}` : paintedKey;
  }).join(` ${hpaint('·', 'grid', mode)} `);
}

export function renderManagerConfig({
  controller,
  width = 120,
  height = 36,
  mode = 'mono',
  previewAvailable = false
} = {}) {
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const language = controller?.draftConfig?.language ?? controller?.savedConfig?.language ?? 'en';
  const rawRows = controller?.rows?.() ?? [];
  const rows = rawRows.map((row) => localizedRow(row, language));
  const cursorIndex = Math.max(0, Math.min(rows.length - 1, Number(controller?.cursorIndex) || 0));
  const stemWidth = descriptionStemWidth(rows, safeWidth - 2);
  const tabs = MANAGER_CONFIG_TABS.map((tab) => {
    const label = MANAGER_CONFIG_TAB_LABELS[tab] ?? tab;
    return tab === controller?.activeTab ? hpaint(`[${label}]`, 'nav', mode) : hpaint(label, 'dim', mode);
  }).join('  ');

  const activeTabLabel = MANAGER_CONFIG_TAB_LABELS[controller?.activeTab] ?? controller?.activeTab ?? 'Config';
  const lines = [
    padLine(hpaint('CODEX MONITOR · CONFIG', 'heading', mode), safeWidth),
    padLine(tabs, safeWidth),
    padLine(hpaint('─'.repeat(Math.max(0, safeWidth)), 'grid', mode), safeWidth),
    padLine(`${activeTabLabel}${controller?.dirty ? ` ${hpaint('· UNSAVED', 'pressure', mode)}` : ''}`, safeWidth),
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
  if (controller?.status) lines.push(padLine(hpaint(configText(controller.status, language), controller.status.startsWith('Save failed') ? 'error' : 'secondary', mode), safeWidth));
  else lines.push('');
  lines.push(padLine(renderHintLine(configText(
    previewAvailable
      ? 'Tab/←/→ tabs · ↑/↓ select · Enter/Space change · P Live preview · M Manager preview'
      : 'Tab/←/→ tabs · ↑/↓ select · Enter/Space toggle/change',
    language
  ), mode), safeWidth));
  lines.push(padLine(renderHintLine(configText(
    'S save · R revert · Esc/Q back · Archive uses the same lifecycle engine; side effects run only after Save.',
    language
  ), mode), safeWidth));

  return {
    lines: lines.slice(0, safeHeight),
    rows,
    cursorIndex,
    activeTab: controller?.activeTab ?? null,
    dirty: Boolean(controller?.dirty)
  };
}
