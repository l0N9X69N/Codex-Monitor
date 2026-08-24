const ESC = '\x1b[';
const RESET = `${ESC}0m`;

const THEMES = Object.freeze({
  truecolor: Object.freeze({ nav: `${ESC}38;2;0;229;255m`, live: `${ESC}38;2;65;255;120m`, pressure: `${ESC}38;2;255;184;77m`, error: `${ESC}38;2;255;80;100m`, secondary: `${ESC}38;2;189;110;255m`, text: `${ESC}38;2;220;230;240m`, dim: `${ESC}38;2;100;120;135m`, panel: `${ESC}38;2;35;200;220m`, strong: `${ESC}1m`, reset: RESET }),
  '256': Object.freeze({ nav: `${ESC}38;5;51m`, live: `${ESC}38;5;84m`, pressure: `${ESC}38;5;214m`, error: `${ESC}38;5;203m`, secondary: `${ESC}38;5;141m`, text: `${ESC}38;5;252m`, dim: `${ESC}38;5;244m`, panel: `${ESC}38;5;44m`, strong: `${ESC}1m`, reset: RESET }),
  '16': Object.freeze({ nav: `${ESC}96m`, live: `${ESC}92m`, pressure: `${ESC}93m`, error: `${ESC}91m`, secondary: `${ESC}95m`, text: `${ESC}97m`, dim: `${ESC}90m`, panel: `${ESC}96m`, strong: `${ESC}1m`, reset: RESET }),
  mono: Object.freeze({ nav: '', live: '', pressure: '', error: '', secondary: '', text: '', dim: '', panel: '', strong: '', reset: '' })
});

export function detectHistoryColorMode(env = process.env) {
  if (env.NO_COLOR) return 'mono';
  const term = String(env.TERM ?? '').toLowerCase();
  const color = String(env.COLORTERM ?? '').toLowerCase();
  if (color.includes('truecolor') || color.includes('24bit')) return 'truecolor';
  if (term.includes('256color')) return '256';
  if (term && term !== 'dumb') return '16';
  return 'mono';
}

export function historyTokens(mode = '256') { return THEMES[mode] ?? THEMES['256']; }

export function hpaint(text, token, mode = '256') {
  const tokens = historyTokens(mode);
  const prefix = tokens[token] ?? '';
  return prefix ? `${prefix}${String(text ?? '')}${tokens.reset}` : String(text ?? '');
}
