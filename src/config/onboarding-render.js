import { hpaint } from '../history/theme.js';
import { padCells, truncateCells } from '../ui/cell-width.js';
import { ONBOARDING_STEP } from './onboarding.js';

function line(text, width) {
  return truncateCells(String(text ?? ''), width, '…');
}

function choicePrefix(row, focused) {
  if (row.kind === 'toggle') return `${focused ? '▸ ' : '  '}[${row.checked ? 'x' : ' '}] `;
  if (row.kind === 'choice') return `${focused ? '▸ ' : '  '}${row.selected ? '●' : '○'} `;
  return `${focused ? '▸ ' : '  '}`;
}

function renderRows(rows, cursorIndex, width, mode, budget) {
  if (!rows.length) return [];
  const start = Math.max(0, Math.min(cursorIndex - Math.floor(budget / 2), Math.max(0, rows.length - budget)));
  return rows.slice(start, start + budget).map((row, offset) => {
    const absolute = start + offset;
    const focused = absolute === cursorIndex;
    const prefix = choicePrefix(row, focused);
    const suffix = row.kind === 'cycle' ? `  ${row.value}` : '';
    const plain = `${prefix}${row.label}${suffix}`;
    if (focused) return hpaint(padCells(truncateCells(plain, width, '…'), width), 'selected', mode);
    const token = row.kind === 'toggle' && row.checked ? 'strong' : row.selected ? 'strong' : row.kind === 'action' ? 'nav' : 'text';
    return truncateCells(`${prefix}${hpaint(row.label, token, mode)}${suffix ? hpaint(suffix, 'secondary', mode) : ''}`, width, '…');
  });
}

function summaryLines(config) {
  return [
    `Language       ${config.language === 'vi' ? 'Vietnamese' : 'English'}`,
    `Live preset    ${config.preset}`,
    `Theme          ${config.theme}`,
    `Background     ${config.background}`,
    `Manager        ${config.manager?.view ?? 'operations'}`,
    `System         ${config.systemMode}`,
    `Companion      ${config.beastMode}`,
    `Archive        ${config.archive?.enabled ? 'Enabled' : 'Disabled'}`
  ];
}

export function renderOnboarding({ controller, width = 100, height = 30, mode = 'mono' } = {}) {
  const safeWidth = Math.max(44, Number(width) || 100);
  const safeHeight = Math.max(16, Number(height) || 30);
  const step = controller?.step ?? ONBOARDING_STEP.WELCOME;
  const rows = controller?.rows?.() ?? [];
  const cursorIndex = Math.max(0, Math.min(Math.max(0, rows.length - 1), Number(controller?.cursorIndex) || 0));
  const lines = [
    line(hpaint('CODEX MONITOR // INITIAL SETUP', 'heading', mode), safeWidth),
    line(hpaint('Configure once, change anytime with codexm --configure', 'dim', mode), safeWidth),
    line(hpaint('─'.repeat(safeWidth), 'grid', mode), safeWidth),
    ''
  ];

  if (step === ONBOARDING_STEP.WELCOME) {
    lines.push(hpaint('Welcome', 'nav', mode));
    lines.push('');
    lines.push('Codex Monitor adds a passive Live HUD and a local Session Manager around official Codex.');
    lines.push('The setup below only chooses Monitor preferences. It does not change Codex auth or history.');
    lines.push('');
    lines.push('Enter  Continue');
    lines.push('Esc    Cancel');
  } else if (step === ONBOARDING_STEP.LANGUAGE) {
    lines.push(hpaint('Language', 'nav', mode));
    lines.push(...renderRows(rows, cursorIndex, safeWidth, mode, safeHeight - 10));
  } else if (step === ONBOARDING_STEP.PRESET) {
    lines.push(hpaint('Live Monitor preset', 'nav', mode));
    lines.push(hpaint('Choose what information you want visible. Responsive layout remains automatic.', 'dim', mode));
    lines.push(...renderRows(rows, cursorIndex, safeWidth, mode, safeHeight - 11));
  } else if (step.startsWith('custom-')) {
    const titles = {
      [ONBOARDING_STEP.CUSTOM_SECTIONS]: 'Custom · Sections',
      [ONBOARDING_STEP.CUSTOM_DISPLAY]: 'Custom · Display modes',
      [ONBOARDING_STEP.CUSTOM_HEADER]: 'Custom · Header',
      [ONBOARDING_STEP.CUSTOM_FIELDS]: 'Custom · Field visibility'
    };
    lines.push(hpaint(titles[step] ?? 'Custom', 'nav', mode));
    lines.push(...renderRows(rows, cursorIndex, safeWidth, mode, safeHeight - 10));
  } else if (step === ONBOARDING_STEP.APPEARANCE) {
    lines.push(hpaint('Appearance', 'nav', mode));
    lines.push(...renderRows(rows, cursorIndex, safeWidth, mode, safeHeight - 10));
  } else if (step === ONBOARDING_STEP.MANAGER) {
    lines.push(hpaint('Manager default view', 'nav', mode));
    lines.push(hpaint('V can still switch views at runtime without changing this saved default.', 'dim', mode));
    lines.push(...renderRows(rows, cursorIndex, safeWidth, mode, safeHeight - 11));
  } else if (step === ONBOARDING_STEP.SUMMARY) {
    lines.push(hpaint('READY TO SAVE', 'nav', mode));
    lines.push('');
    lines.push(...summaryLines(controller.draftConfig));
    lines.push('');
    lines.push(hpaint('Enter  Save and continue', 'strong', mode));
    lines.push('Backspace/Left  Back');
    lines.push('Esc             Cancel');
  }

  while (lines.length < safeHeight - 2) lines.push('');
  if (controller?.status) lines.push(line(hpaint(controller.status, controller.status.startsWith('Save failed') ? 'error' : 'secondary', mode), safeWidth));
  else lines.push('');
  if (step !== ONBOARDING_STEP.WELCOME && step !== ONBOARDING_STEP.SUMMARY) {
    lines.push(line(hpaint('↑/↓ select · Enter/Space choose/change · Backspace/← back · Esc cancel', 'dim', mode), safeWidth));
  } else {
    lines.push(line(hpaint('No preference is written until explicit Save.', 'dim', mode), safeWidth));
  }

  return { lines: lines.slice(0, safeHeight), step, rows, cursorIndex };
}
