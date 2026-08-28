import { validateChoice } from '../config/schema.js';

const EMPTY_OVERRIDES = Object.freeze({
  preset: null,
  theme: null,
  background: null,
  language: null,
  managerView: null
});

const CONTROL_COMMANDS = new Set([
  'doctor',
  'repair',
  'update',
  'version',
  'config',
  'config-path',
  'demo'
]);

const DEMO_STATES = new Set(['idle', 'thinking', 'tool', 'approval', 'error']);

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

// codexm is intentionally a transparent Codex wrapper. Monitor does not own
// any CLI flag in this entrypoint; every argument is forwarded in original
// order. Product commands live in codexmm/codexmc/codexmh/codexmctl instead.
export function parseMonitorArgs(argv = []) {
  return {
    action: 'run',
    auth: 'auto',
    codexArgs: [...argv],
    overrides: { ...EMPTY_OVERRIDES },
    demo: { state: 'idle' }
  };
}

export function parseManagerArgs(argv = []) {
  let help = false;
  let view = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (arg === '--view') {
      view = normalizeChoice('managerViews', requireValue(argv, index, '--view'), '--view');
      index += 1;
      continue;
    }
    if (arg.startsWith('--view=')) {
      view = normalizeChoice('managerViews', arg.slice('--view='.length), '--view');
      continue;
    }
    throw new Error(`Unknown codexmm option: ${arg}`);
  }
  return { help, view };
}

export function parseConfigArgs(argv = []) {
  let help = false;
  let reset = false;
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') help = true;
    else if (arg === '--reset') reset = true;
    else throw new Error(`Unknown codexmc option: ${arg}`);
  }
  return { help, reset };
}

export function parseControlArgs(argv = []) {
  const source = [...argv];
  const rawCommand = String(source.shift() ?? '').trim().toLowerCase();
  if (!rawCommand || rawCommand === 'help' || rawCommand === '-h' || rawCommand === '--help') {
    if (source.length) throw new Error(`Unexpected codexmctl argument: ${source[0]}`);
    return { command: 'help', demoState: 'idle' };
  }

  const command = rawCommand === 'diagnostics' ? 'doctor' : rawCommand;
  if (!CONTROL_COMMANDS.has(command)) throw new Error(`Unknown codexmctl command: ${rawCommand}`);

  if (command !== 'demo') {
    if (source.length) throw new Error(`Unexpected argument for codexmctl ${command}: ${source[0]}`);
    return { command, demoState: 'idle' };
  }

  let demoState = 'idle';
  if (source.length === 1) demoState = String(source[0]).trim().toLowerCase();
  else if (source.length > 1) throw new Error(`Unexpected argument for codexmctl demo: ${source[1]}`);
  if (!DEMO_STATES.has(demoState)) throw new Error(`codexmctl demo received unsupported state: ${demoState}`);
  return { command, demoState };
}

export { CONTROL_COMMANDS, DEMO_STATES };
