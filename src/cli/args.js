import { normalizeAuthOverride } from '../core/auth.js';

export function parseMonitorArgs(argv = []) {
  const codexArgs = [];
  let auth = 'auto';
  let action = 'run';
  let parsingMonitor = true;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (parsingMonitor && arg === '--') {
      parsingMonitor = false;
      continue;
    }

    if (parsingMonitor && arg === '--help') {
      action = 'help';
      continue;
    }
    if (parsingMonitor && arg === '--doctor') {
      action = 'doctor';
      continue;
    }
    if (parsingMonitor && arg === '--monitor-version') {
      action = 'monitor-version';
      continue;
    }
    if (parsingMonitor && arg === '--auth') {
      auth = normalizeAuthOverride(argv[i + 1]);
      i += 1;
      continue;
    }
    if (parsingMonitor && arg.startsWith('--auth=')) {
      auth = normalizeAuthOverride(arg.slice('--auth='.length));
      continue;
    }

    codexArgs.push(arg);
  }

  return { action, auth, codexArgs };
}
