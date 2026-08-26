const ESC = '\x1b[';
const RESET = `${ESC}0m`;

const COLOR_THEMES = Object.freeze({
  truecolor: Object.freeze({
    nav: `${ESC}38;2;217;130;118m`,
    live: `${ESC}38;2;105;211;139m`,
    pressure: `${ESC}38;2;214;196;107m`,
    error: `${ESC}38;2;224;93;97m`,
    secondary: `${ESC}38;2;116;182;216m`,
    session: `${ESC}38;2;199;173;104m`,
    text: `${ESC}38;2;216;214;209m`,
    dim: `${ESC}38;2;112;113;126m`,
    panel: `${ESC}38;2;74;75;89m`,
    selected: `${ESC}48;2;101;55;58;38;2;244;239;233m`,
    strong: `${ESC}1m`,
    reset: RESET
  }),
  '256': Object.freeze({
    nav: `${ESC}38;5;174m`,
    live: `${ESC}38;5;78m`,
    pressure: `${ESC}38;5;179m`,
    error: `${ESC}38;5;167m`,
    secondary: `${ESC}38;5;110m`,
    session: `${ESC}38;5;179m`,
    text: `${ESC}38;5;252m`,
    dim: `${ESC}38;5;243m`,
    panel: `${ESC}38;5;239m`,
    selected: `${ESC}48;5;52;38;5;255m`,
    strong: `${ESC}1m`,
    reset: RESET
  }),
  '16': Object.freeze({
    nav: `${ESC}91m`,
    live: `${ESC}92m`,
    pressure: `${ESC}93m`,
    error: `${ESC}91m`,
    secondary: `${ESC}96m`,
    session: `${ESC}93m`,
    text: `${ESC}97m`,
    dim: `${ESC}90m`,
    panel: `${ESC}90m`,
    selected: `${ESC}100;97m`,
    strong: `${ESC}1m`,
    reset: RESET
  })
});

const MATRIX_THEMES = Object.freeze({
  truecolor: Object.freeze({ nav: `${ESC}38;2;130;255;130m`, live: `${ESC}38;2;80;255;120m`, pressure: `${ESC}38;2;190;255;90m`, error: `${ESC}38;2;255;95;95m`, secondary: `${ESC}38;2;70;210;105m`, session: `${ESC}38;2;150;235;140m`, text: `${ESC}38;2;180;255;190m`, dim: `${ESC}38;2;75;135;85m`, panel: `${ESC}38;2;40;110;60m`, selected: `${ESC}48;2;20;48;27;38;2;220;255;225m`, strong: `${ESC}1m`, reset: RESET }),
  '256': Object.freeze({ nav: `${ESC}38;5;120m`, live: `${ESC}38;5;84m`, pressure: `${ESC}38;5;156m`, error: `${ESC}38;5;203m`, secondary: `${ESC}38;5;41m`, session: `${ESC}38;5;114m`, text: `${ESC}38;5;157m`, dim: `${ESC}38;5;65m`, panel: `${ESC}38;5;23m`, selected: `${ESC}48;5;22;38;5;157m`, strong: `${ESC}1m`, reset: RESET }),
  '16': Object.freeze({ nav: `${ESC}92m`, live: `${ESC}92m`, pressure: `${ESC}92m`, error: `${ESC}91m`, secondary: `${ESC}32m`, session: `${ESC}92m`, text: `${ESC}92m`, dim: `${ESC}90m`, panel: `${ESC}32m`, selected: `${ESC}42;30m`, strong: `${ESC}1m`, reset: RESET })
});

const MONO = Object.freeze({ nav: '', live: '', pressure: '', error: '', secondary: '', session: '', text: '', dim: '', panel: '', selected: '', strong: '', reset: '' });

export function detectHistoryColorMode(env = process.env) {
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

export function historyTokens(mode = '256') {
  if (mode === 'mono') return MONO;
  const raw = String(mode ?? '256').toLowerCase();
  if (raw.startsWith('matrix:')) {
    const level = raw.slice('matrix:'.length);
    return MATRIX_THEMES[level] ?? MATRIX_THEMES['256'];
  }
  return COLOR_THEMES[raw] ?? COLOR_THEMES['256'];
}

export function hpaint(text, token, mode = '256') {
  const tokens = historyTokens(mode);
  const prefix = tokens[token] ?? '';
  return prefix ? `${prefix}${String(text ?? '')}${tokens.reset}` : String(text ?? '');
}
