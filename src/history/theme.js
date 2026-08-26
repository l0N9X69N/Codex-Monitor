const ESC = '\x1b[';
const RESET = `${ESC}0m`;

const COLOR_THEMES = Object.freeze({
  truecolor: Object.freeze({
    nav: `${ESC}38;2;217;130;118m`,
    live: `${ESC}38;2;105;211;139m`,
    pressure: `${ESC}38;2;219;188;89m`,
    error: `${ESC}38;2;224;93;97m`,
    secondary: `${ESC}38;2;116;190;222m`,
    session: `${ESC}38;2;203;173;107m`,
    text: `${ESC}38;2;224;221;216m`,
    heading: `${ESC}1;38;2;239;235;229m`,
    label: `${ESC}38;2;164;160;177m`,
    dim: `${ESC}38;2;111;113;130m`,
    panel: `${ESC}38;2;70;73;89m`,
    grid: `${ESC}38;2;55;58;72m`,
    selected: `${ESC}48;2;105;58;62;38;2;247;241;234m`,
    strong: `${ESC}1;38;2;239;235;229m`,
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
    heading: `${ESC}1;38;5;255m`,
    label: `${ESC}38;5;146m`,
    dim: `${ESC}38;5;243m`,
    panel: `${ESC}38;5;239m`,
    grid: `${ESC}38;5;237m`,
    selected: `${ESC}48;5;52;38;5;255m`,
    strong: `${ESC}1;38;5;255m`,
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
    heading: `${ESC}1;97m`,
    label: `${ESC}37m`,
    dim: `${ESC}90m`,
    panel: `${ESC}90m`,
    grid: `${ESC}90m`,
    selected: `${ESC}100;97m`,
    strong: `${ESC}1;97m`,
    reset: RESET
  })
});

const MATRIX_THEMES = Object.freeze({
  truecolor: Object.freeze({ nav: `${ESC}38;2;130;255;130m`, live: `${ESC}38;2;80;255;120m`, pressure: `${ESC}38;2;190;255;90m`, error: `${ESC}38;2;255;95;95m`, secondary: `${ESC}38;2;70;210;105m`, session: `${ESC}38;2;150;235;140m`, text: `${ESC}38;2;180;255;190m`, heading: `${ESC}1;38;2;210;255;215m`, label: `${ESC}38;2;115;190;125m`, dim: `${ESC}38;2;75;135;85m`, panel: `${ESC}38;2;40;110;60m`, grid: `${ESC}38;2;27;72;42m`, selected: `${ESC}48;2;20;48;27;38;2;220;255;225m`, strong: `${ESC}1;38;2;210;255;215m`, reset: RESET }),
  '256': Object.freeze({ nav: `${ESC}38;5;120m`, live: `${ESC}38;5;84m`, pressure: `${ESC}38;5;156m`, error: `${ESC}38;5;203m`, secondary: `${ESC}38;5;41m`, session: `${ESC}38;5;114m`, text: `${ESC}38;5;157m`, heading: `${ESC}1;38;5;157m`, label: `${ESC}38;5;71m`, dim: `${ESC}38;5;65m`, panel: `${ESC}38;5;23m`, grid: `${ESC}38;5;22m`, selected: `${ESC}48;5;22;38;5;157m`, strong: `${ESC}1;38;5;157m`, reset: RESET }),
  '16': Object.freeze({ nav: `${ESC}92m`, live: `${ESC}92m`, pressure: `${ESC}92m`, error: `${ESC}91m`, secondary: `${ESC}32m`, session: `${ESC}92m`, text: `${ESC}92m`, heading: `${ESC}1;92m`, label: `${ESC}32m`, dim: `${ESC}90m`, panel: `${ESC}32m`, grid: `${ESC}90m`, selected: `${ESC}42;30m`, strong: `${ESC}1;92m`, reset: RESET })
});

const MONO = Object.freeze({ nav: '', live: '', pressure: '', error: '', secondary: '', session: '', text: '', heading: '', label: '', dim: '', panel: '', grid: '', selected: '', strong: '', reset: '' });

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
