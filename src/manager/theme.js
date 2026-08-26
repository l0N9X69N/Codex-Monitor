const ESC = '\x1b[';
const RESET = `${ESC}0m`;

const COLOR = Object.freeze({
  truecolor: Object.freeze({ nav: `${ESC}38;2;0;229;255m`, live: `${ESC}38;2;65;255;120m`, pressure: `${ESC}38;2;255;184;77m`, error: `${ESC}38;2;255;80;100m`, secondary: `${ESC}38;2;189;110;255m`, text: `${ESC}38;2;220;230;240m`, dim: `${ESC}38;2;100;120;135m`, panel: `${ESC}38;2;35;200;220m`, strong: `${ESC}1m`, reset: RESET }),
  '256': Object.freeze({ nav: `${ESC}38;5;51m`, live: `${ESC}38;5;84m`, pressure: `${ESC}38;5;214m`, error: `${ESC}38;5;203m`, secondary: `${ESC}38;5;141m`, text: `${ESC}38;5;252m`, dim: `${ESC}38;5;244m`, panel: `${ESC}38;5;44m`, strong: `${ESC}1m`, reset: RESET }),
  '16': Object.freeze({ nav: `${ESC}96m`, live: `${ESC}92m`, pressure: `${ESC}93m`, error: `${ESC}91m`, secondary: `${ESC}95m`, text: `${ESC}97m`, dim: `${ESC}90m`, panel: `${ESC}96m`, strong: `${ESC}1m`, reset: RESET })
});

const MATRIX = Object.freeze({
  truecolor: Object.freeze({ nav: `${ESC}38;2;130;255;130m`, live: `${ESC}38;2;80;255;120m`, pressure: `${ESC}38;2;190;255;90m`, error: `${ESC}38;2;255;95;95m`, secondary: `${ESC}38;2;70;210;105m`, text: `${ESC}38;2;180;255;190m`, dim: `${ESC}38;2;75;135;85m`, panel: `${ESC}38;2;40;225;90m`, strong: `${ESC}1m`, reset: RESET }),
  '256': Object.freeze({ nav: `${ESC}38;5;120m`, live: `${ESC}38;5;84m`, pressure: `${ESC}38;5;156m`, error: `${ESC}38;5;203m`, secondary: `${ESC}38;5;41m`, text: `${ESC}38;5;157m`, dim: `${ESC}38;5;65m`, panel: `${ESC}38;5;47m`, strong: `${ESC}1m`, reset: RESET }),
  '16': Object.freeze({ nav: `${ESC}92m`, live: `${ESC}92m`, pressure: `${ESC}92m`, error: `${ESC}91m`, secondary: `${ESC}32m`, text: `${ESC}92m`, dim: `${ESC}90m`, panel: `${ESC}32m`, strong: `${ESC}1m`, reset: RESET })
});

const MONO = Object.freeze({ nav: '', live: '', pressure: '', error: '', secondary: '', text: '', dim: '', panel: '', strong: '', reset: '' });

export function detectManagerColorMode(env = process.env) {
  if (env.NO_COLOR) return 'mono';
  const term = String(env.TERM ?? '').toLowerCase();
  const color = String(env.COLORTERM ?? '').toLowerCase();
  const termProgram = String(env.TERM_PROGRAM ?? '').toLowerCase();
  if (color.includes('truecolor') || color.includes('24bit')) return 'truecolor';
  if (env.WT_SESSION) return 'truecolor';
  if (['vscode', 'wezterm', 'ghostty'].some((name) => termProgram.includes(name))) return 'truecolor';
  if (term.includes('256color')) return '256';
  if (term && term !== 'dumb') return '16';
  return 'mono';
}

export function resolveManagerPaintMode(theme = 'color', capability = '256') {
  const normalizedTheme = String(theme ?? 'color').toLowerCase();
  if (normalizedTheme === 'mono' || capability === 'mono') return 'mono';
  const style = normalizedTheme === 'matrix' ? 'matrix' : 'color';
  const level = ['truecolor', '256', '16'].includes(capability) ? capability : '256';
  return `${style}:${level}`;
}

export function managerTokens(mode = 'color:256') {
  if (mode === 'mono') return MONO;
  const [style, level] = String(mode).split(':');
  const family = style === 'matrix' ? MATRIX : COLOR;
  return family[level] ?? family['256'];
}

export function mpaint(text, token, mode = 'color:256') {
  const tokens = managerTokens(mode);
  const prefix = tokens[token] ?? '';
  return prefix ? `${prefix}${String(text ?? '')}${tokens.reset}` : String(text ?? '');
}
