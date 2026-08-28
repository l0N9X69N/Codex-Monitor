const ESC = '\x1b[';
const RESET = `${ESC}0m`;

// COLOR is the balanced everyday palette: colored structure and semantic text,
// but lower saturation than CYBERPUNK so the Manager remains comfortable for
// long sessions. The cyber* token names are semantic accents used by Manager
// headings; each palette is free to render those accents at its own intensity.
const COLOR_THEMES = Object.freeze({
  truecolor: Object.freeze({
    nav: `${ESC}38;2;132;184;214m`,
    live: `${ESC}38;2;105;194;139m`,
    pressure: `${ESC}38;2;210;181;101m`,
    error: `${ESC}38;2;220;103;108m`,
    secondary: `${ESC}38;2;116;180;210m`,
    session: `${ESC}38;2;180;151;207m`,
    text: `${ESC}38;2;224;221;216m`,
    heading: `${ESC}1;38;2;226;232;240m`,
    label: `${ESC}38;2;164;160;177m`,
    dim: `${ESC}38;2;111;113;130m`,
    panel: `${ESC}38;2;69;91;120m`,
    grid: `${ESC}38;2;56;66;88m`,
    selected: `${ESC}48;2;43;56;78;38;2;242;239;233m`,
    strong: `${ESC}1;38;2;226;232;240m`,
    cyberCyan: `${ESC}1;38;2;116;190;222m`,
    cyberMagenta: `${ESC}1;38;2;187;154;212m`,
    cyberAmber: `${ESC}1;38;2;203;173;107m`,
    cyberGreen: `${ESC}1;38;2;105;194;139m`,
    reset: RESET
  }),
  '256': Object.freeze({
    nav: `${ESC}38;5;110m`,
    live: `${ESC}38;5;78m`,
    pressure: `${ESC}38;5;179m`,
    error: `${ESC}38;5;167m`,
    secondary: `${ESC}38;5;110m`,
    session: `${ESC}38;5;146m`,
    text: `${ESC}38;5;252m`,
    heading: `${ESC}1;38;5;255m`,
    label: `${ESC}38;5;146m`,
    dim: `${ESC}38;5;243m`,
    panel: `${ESC}38;5;67m`,
    grid: `${ESC}38;5;60m`,
    selected: `${ESC}48;5;24;38;5;255m`,
    strong: `${ESC}1;38;5;255m`,
    cyberCyan: `${ESC}1;38;5;110m`,
    cyberMagenta: `${ESC}1;38;5;146m`,
    cyberAmber: `${ESC}1;38;5;179m`,
    cyberGreen: `${ESC}1;38;5;78m`,
    reset: RESET
  }),
  '16': Object.freeze({
    nav: `${ESC}96m`,
    live: `${ESC}92m`,
    pressure: `${ESC}93m`,
    error: `${ESC}91m`,
    secondary: `${ESC}96m`,
    session: `${ESC}95m`,
    text: `${ESC}97m`,
    heading: `${ESC}1;97m`,
    label: `${ESC}37m`,
    dim: `${ESC}90m`,
    panel: `${ESC}36m`,
    grid: `${ESC}90m`,
    selected: `${ESC}44;97m`,
    strong: `${ESC}1;97m`,
    cyberCyan: `${ESC}1;96m`,
    cyberMagenta: `${ESC}1;95m`,
    cyberAmber: `${ESC}1;93m`,
    cyberGreen: `${ESC}1;92m`,
    reset: RESET
  })
});

// CYBERPUNK is intentionally higher-saturation: cyan data, neon green live
// telemetry, amber pressure, magenta navigation/focus, and a violet grid.
const CYBERPUNK_THEMES = Object.freeze({
  truecolor: Object.freeze({
    nav: `${ESC}38;2;232;121;249m`,
    live: `${ESC}38;2;57;255;136m`,
    pressure: `${ESC}38;2;250;204;21m`,
    error: `${ESC}38;2;255;75;110m`,
    secondary: `${ESC}38;2;34;211;238m`,
    session: `${ESC}38;2;192;132;252m`,
    text: `${ESC}38;2;226;232;240m`,
    heading: `${ESC}1;38;2;103;232;249m`,
    label: `${ESC}38;2;174;166;205m`,
    dim: `${ESC}38;2;111;113;135m`,
    panel: `${ESC}38;2;27;103;123m`,
    grid: `${ESC}38;2;72;50;98m`,
    selected: `${ESC}48;2;72;28;91;38;2;240;249;255m`,
    strong: `${ESC}1;38;2;103;232;249m`,
    cyberCyan: `${ESC}1;38;2;34;211;238m`,
    cyberMagenta: `${ESC}1;38;2;232;121;249m`,
    cyberAmber: `${ESC}1;38;2;250;204;21m`,
    cyberGreen: `${ESC}1;38;2;57;255;136m`,
    reset: RESET
  }),
  '256': Object.freeze({
    nav: `${ESC}38;5;213m`,
    live: `${ESC}38;5;84m`,
    pressure: `${ESC}38;5;220m`,
    error: `${ESC}38;5;204m`,
    secondary: `${ESC}38;5;45m`,
    session: `${ESC}38;5;141m`,
    text: `${ESC}38;5;255m`,
    heading: `${ESC}1;38;5;117m`,
    label: `${ESC}38;5;146m`,
    dim: `${ESC}38;5;243m`,
    panel: `${ESC}38;5;30m`,
    grid: `${ESC}38;5;54m`,
    selected: `${ESC}48;5;54;38;5;255m`,
    strong: `${ESC}1;38;5;117m`,
    cyberCyan: `${ESC}1;38;5;45m`,
    cyberMagenta: `${ESC}1;38;5;213m`,
    cyberAmber: `${ESC}1;38;5;220m`,
    cyberGreen: `${ESC}1;38;5;84m`,
    reset: RESET
  }),
  '16': Object.freeze({
    nav: `${ESC}95m`,
    live: `${ESC}92m`,
    pressure: `${ESC}93m`,
    error: `${ESC}91m`,
    secondary: `${ESC}96m`,
    session: `${ESC}95m`,
    text: `${ESC}97m`,
    heading: `${ESC}1;96m`,
    label: `${ESC}37m`,
    dim: `${ESC}90m`,
    panel: `${ESC}36m`,
    grid: `${ESC}35m`,
    selected: `${ESC}45;97m`,
    strong: `${ESC}1;96m`,
    cyberCyan: `${ESC}1;96m`,
    cyberMagenta: `${ESC}1;95m`,
    cyberAmber: `${ESC}1;93m`,
    cyberGreen: `${ESC}1;92m`,
    reset: RESET
  })
});

const MATRIX_THEMES = Object.freeze({
  truecolor: Object.freeze({ nav: `${ESC}38;2;130;255;130m`, live: `${ESC}38;2;80;255;120m`, pressure: `${ESC}38;2;190;255;90m`, error: `${ESC}38;2;255;95;95m`, secondary: `${ESC}38;2;70;210;105m`, session: `${ESC}38;2;150;235;140m`, text: `${ESC}38;2;180;255;190m`, heading: `${ESC}1;38;2;210;255;215m`, label: `${ESC}38;2;115;190;125m`, dim: `${ESC}38;2;75;135;85m`, panel: `${ESC}38;2;40;110;60m`, grid: `${ESC}38;2;27;72;42m`, selected: `${ESC}48;2;20;48;27;38;2;220;255;225m`, strong: `${ESC}1;38;2;210;255;215m`, cyberCyan: `${ESC}1;38;2;120;255;180m`, cyberMagenta: `${ESC}1;38;2;170;255;150m`, cyberAmber: `${ESC}1;38;2;205;255;105m`, cyberGreen: `${ESC}1;38;2;80;255;120m`, reset: RESET }),
  '256': Object.freeze({ nav: `${ESC}38;5;120m`, live: `${ESC}38;5;84m`, pressure: `${ESC}38;5;156m`, error: `${ESC}38;5;203m`, secondary: `${ESC}38;5;41m`, session: `${ESC}38;5;114m`, text: `${ESC}38;5;157m`, heading: `${ESC}1;38;5;157m`, label: `${ESC}38;5;71m`, dim: `${ESC}38;5;65m`, panel: `${ESC}38;5;23m`, grid: `${ESC}38;5;22m`, selected: `${ESC}48;5;22;38;5;157m`, strong: `${ESC}1;38;5;157m`, cyberCyan: `${ESC}1;38;5;121m`, cyberMagenta: `${ESC}1;38;5;120m`, cyberAmber: `${ESC}1;38;5;156m`, cyberGreen: `${ESC}1;38;5;84m`, reset: RESET }),
  '16': Object.freeze({ nav: `${ESC}92m`, live: `${ESC}92m`, pressure: `${ESC}92m`, error: `${ESC}91m`, secondary: `${ESC}32m`, session: `${ESC}92m`, text: `${ESC}92m`, heading: `${ESC}1;92m`, label: `${ESC}32m`, dim: `${ESC}90m`, panel: `${ESC}32m`, grid: `${ESC}90m`, selected: `${ESC}42;30m`, strong: `${ESC}1;92m`, cyberCyan: `${ESC}1;92m`, cyberMagenta: `${ESC}1;92m`, cyberAmber: `${ESC}1;92m`, cyberGreen: `${ESC}1;92m`, reset: RESET })
});

const MONO = Object.freeze({
  nav: '', live: '', pressure: '', error: '', secondary: '', session: '', text: '',
  heading: '', label: '', dim: '', panel: '', grid: '', selected: '', strong: '',
  cyberCyan: '', cyberMagenta: '', cyberAmber: '', cyberGreen: '', reset: ''
});

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
  if (raw === 'cyberpunk') return CYBERPUNK_THEMES['256'];
  if (raw.startsWith('cyberpunk:')) {
    const level = raw.slice('cyberpunk:'.length);
    return CYBERPUNK_THEMES[level] ?? CYBERPUNK_THEMES['256'];
  }
  if (raw === 'matrix') return MATRIX_THEMES['256'];
  if (raw.startsWith('matrix:')) {
    const level = raw.slice('matrix:'.length);
    return MATRIX_THEMES[level] ?? MATRIX_THEMES['256'];
  }
  return COLOR_THEMES[raw] ?? COLOR_THEMES['256'];
}

function semanticHeadingToken(text, token) {
  if (token !== 'heading' && token !== 'strong') return token;
  const label = String(text ?? '').toUpperCase();
  if (token === 'strong' && label.includes('SESSION MANAGER')) return 'cyberCyan';
  if (/TOKEN|BURN/.test(label)) return 'cyberCyan';
  if (/LIVE|TOOL|CURRENT|SYSTEM MOTION/.test(label)) return 'cyberGreen';
  if (/CONTEXT|TURNAROUND|STATUS|EVENT/.test(label)) return 'cyberAmber';
  if (/SESSION|SELECT|RECENT|INDEX/.test(label)) return 'cyberMagenta';
  return token;
}

function managerHintLine(text, tokens) {
  const raw = String(text ?? '');
  if (!/\bEnter\s+inspect\b/.test(raw) || !/\bV\s+view\b/.test(raw)) return null;
  const keyPattern = /(↑↓|Enter|Q\/Esc|Q|F|S|D|V|\/)(?=\s|$)/g;
  let cursor = 0;
  let output = tokens.dim;
  for (const match of raw.matchAll(keyPattern)) {
    output += raw.slice(cursor, match.index);
    const keyToken = String(match[0]).startsWith('Q') ? tokens.cyberMagenta : tokens.cyberCyan;
    output += `${tokens.reset}${keyToken}${match[0]}${tokens.reset}${tokens.dim}`;
    cursor = match.index + match[0].length;
  }
  output += `${raw.slice(cursor)}${tokens.reset}`;
  return output;
}

export function hpaint(text, token, mode = '256') {
  const tokens = historyTokens(mode);
  if (mode !== 'mono' && token === 'dim') {
    const hint = managerHintLine(text, tokens);
    if (hint) return hint;
  }
  const resolvedToken = semanticHeadingToken(text, token);
  const prefix = tokens[resolvedToken] ?? '';
  return prefix ? `${prefix}${String(text ?? '')}${tokens.reset}` : String(text ?? '');
}
