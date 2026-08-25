import { normalizeAuthOverride } from '../core/auth.js';
import { validateChoice } from '../config/schema.js';

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

export function parseMonitorArgs(argv = []) {
  const codexArgs = [];
  let auth = 'auto';
  let action = 'run';
  let parsingMonitor = true;
  const overrides = { preset: null, theme: null, language: null };
  const demo = { state: 'idle' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (parsingMonitor && arg === '--') { parsingMonitor = false; continue; }
    if (parsingMonitor && arg === '--help') { action = 'help'; continue; }
    if (parsingMonitor && arg === '--manager') { action = 'manager'; continue; }
    if (parsingMonitor && arg === '--doctor') { action = 'doctor'; continue; }
    if (parsingMonitor && arg === '--monitor-version') { action = 'monitor-version'; continue; }
    if (parsingMonitor && arg === '--configure') { action = 'configure'; continue; }
    if (parsingMonitor && arg === '--reset') { action = 'reset'; continue; }
    if (parsingMonitor && arg === '--config') { action = 'config'; continue; }
    if (parsingMonitor && arg === '--config-path') { action = 'config-path'; continue; }
    if (parsingMonitor && arg === '--demo') { action = 'demo'; continue; }

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
    if (parsingMonitor && arg === '--lang') {
      overrides.language = normalizeChoice('languages', requireValue(argv, i, '--lang'), '--lang');
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--lang=')) { overrides.language = normalizeChoice('languages', arg.slice('--lang='.length), '--lang'); continue; }
    if (parsingMonitor && arg === '--demo-state') {
      const value = String(requireValue(argv, i, '--demo-state')).trim().toLowerCase();
      if (!['idle', 'thinking', 'tool', 'approval', 'error'].includes(value)) throw new Error(`--demo-state received unsupported value: ${value}`);
      demo.state = value;
      action = 'demo';
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--demo-state=')) {
      const value = String(arg.slice('--demo-state='.length)).trim().toLowerCase();
      if (!['idle', 'thinking', 'tool', 'approval', 'error'].includes(value)) throw new Error(`--demo-state received unsupported value: ${value}`);
      demo.state = value;
      action = 'demo';
      continue;
    }

    codexArgs.push(arg);
  }

  return { action, auth, codexArgs, overrides, demo };
}
