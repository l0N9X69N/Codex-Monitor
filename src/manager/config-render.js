import { hpaint } from '../history/theme.js';
import { truncateCells } from '../ui/cell-width.js';
import { MANAGER_CONFIG_TABS, MANAGER_CONFIG_TAB_LABELS } from './config-controller.js';

function padLine(text, width) {
  return truncateCells(String(text ?? ''), width, '');
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
    const pointer = absoluteIndex === cursorIndex ? hpaint('›', 'nav', mode) : ' ';
    const value = hpaint(String(row.value), absoluteIndex === cursorIndex ? 'strong' : 'text', mode);
    const editable = row.editable ? '' : hpaint(' · read-only', 'dim', mode);
    lines.push(padLine(`${pointer} ${row.label}  ${value}${editable}`, safeWidth));
  }

  while (lines.length < safeHeight - 3) lines.push('');
  if (controller?.status) lines.push(padLine(hpaint(controller.status, controller.status.startsWith('Save failed') ? 'error' : 'secondary', mode), safeWidth));
  else lines.push('');
  lines.push(padLine(hpaint('Tab/←/→ tabs · ↑/↓ select · Enter/Space change · S save · R revert · Esc/Q back', 'dim', mode), safeWidth));
  lines.push(padLine(hpaint('Archive enable/disable uses the same lifecycle engine as codexm --configure.', 'dim', mode), safeWidth));

  return {
    lines: lines.slice(0, safeHeight),
    rows,
    cursorIndex,
    activeTab: controller?.activeTab ?? null,
    dirty: Boolean(controller?.dirty)
  };
}
