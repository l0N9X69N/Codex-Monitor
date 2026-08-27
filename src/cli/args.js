import { normalizeAuthOverride } from '../core/auth.js';
import { validateChoice } from '../config/schema.js';

const ACTION_FLAGS = Object.freeze({
  '--help': 'help',
  '--manager': 'manager',
  '--doctor': 'doctor',
  '--repair': 'repair',
  '--monitor-version': 'monitor-version',
  '--configure': 'configure',
  '--reset': 'reset',
  '--config': 'config',
  '--config-path': 'config-path',
  '--demo': 'demo'
});

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value == null || value === '') throw new Error(`${flag} requires a value`);
  return value;
}

function normalizeChoice(kind, value, flag) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!validateChoice(kind, normalized)) throw new Error(`${flag} received unsupported value: ${value}`);
  return normalized;
}

function selectAction(current, next, flag) {
  if (current === 'run' || current === next) return next;
  throw new Error(`Conflicting Monitor actions: ${current} and ${next} (${flag})`);
}

function selectImplicitAction(current, next, flag) {
  if (current === 'run' || current === next) return next;
  throw new Error(`Conflicting Monitor actions: ${current} and ${next} (${flag})`);
}

export function parseMonitorArgs(argv = []) {
  const codexArgs = [];
  let auth = 'auto';
  let action = 'run';
  let parsingMonitor = true;
  const overrides = { preset: null, theme: null, background: null, language: null, managerView: null };
  const demo = { state: 'idle' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (parsingMonitor && arg === '--') { parsingMonitor = false; continue; }

    if (parsingMonitor && ACTION_FLAGS[arg]) {
      action = selectAction(action, ACTION_FLAGS[arg], arg);
      continue;
    }

    if (parsingMonitor && arg === '--auth') {
      auth = normalizeAuthOverride(requireValue(argv, i, '--auth'));
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--auth=')) { auth = normalizeAuthOverride(arg.slice('--auth='.length)); continue; }

    if (parsingMonitor && arg === '--preset') {
      overrides.preset = normalizeChoice('presets', requireValue(argv, i, '--preset'), '--preset');
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--preset=')) { overrides.preset = normalizeChoice('presets', arg.slice('--preset='.length), '--preset'); continue; }
    if (parsingMonitor && arg === '--theme') {
      overrides.theme = normalizeChoice('themes', requireValue(argv, i, '--theme'), '--theme');
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--theme=')) { overrides.theme = normalizeChoice('themes', arg.slice('--theme='.length), '--theme'); continue; }
    if (parsingMonitor && arg === '--background') {
      overrides.background = normalizeChoice('backgrounds', requireValue(argv, i, '--background'), '--background');
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--background=')) { overrides.background = normalizeChoice('backgrounds', arg.slice('--background='.length), '--background'); continue; }
    if (parsingMonitor && arg === '--lang') {
      overrides.language = normalizeChoice('languages', requireValue(argv, i, '--lang'), '--lang');
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--lang=')) { overrides.language = normalizeChoice('languages', arg.slice('--lang='.length), '--lang'); continue; }
    if (parsingMonitor && arg === '--manager-view') {
      overrides.managerView = normalizeChoice('managerViews', requireValue(argv, i, '--manager-view'), '--manager-view');
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--manager-view=')) {
      overrides.managerView = normalizeChoice('managerViews', arg.slice('--manager-view='.length), '--manager-view');
      continue;
    }
    if (parsingMonitor && arg === '--demo-state') {
      const value = String(requireValue(argv, i, '--demo-state')).trim().toLowerCase();
      if (!['idle', 'thinking', 'tool', 'approval', 'error'].includes(value)) throw new Error(`--demo-state received unsupported value: ${value}`);
      demo.state = value;
      action = selectImplicitAction(action, 'demo', '--demo-state');
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--demo-state=')) {
      const value = String(arg.slice('--demo-state='.length)).trim().toLowerCase();
      if (!['idle', 'thinking', 'tool', 'approval', 'error'].includes(value)) throw new Error(`--demo-state received unsupported value: ${value}`);
      demo.state = value;
      action = selectImplicitAction(action, 'demo', '--demo-state');
      continue;
    }

    codexArgs.push(arg);
  }

  if (overrides.managerView != null && action !== 'manager') {
    throw new Error('--manager-view requires --manager');
  }

  return { action, auth, codexArgs, overrides, demo };
}
