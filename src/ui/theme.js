const ESC = '\x1b[';
const RESET = `${ESC}0m`;

const COLOR = Object.freeze({
  frame: `${ESC}90m`,
  inactive: `${ESC}90m`,
  healthy: `${ESC}32m`,
  thinking: `${ESC}33m`,
  tool: `${ESC}34m`,
  approval: `${ESC}38;5;208m`,
  error: `${ESC}31m`,
  info: `${ESC}36m`,
  nav: `${ESC}36m`,
  reasoning: `${ESC}35m`,
  text: `${ESC}37m`,
  strong: `${ESC}1m`
});

const MONO = Object.freeze({
  frame: '', inactive: '', healthy: '', thinking: '', tool: '', approval: '', error: '',
  info: '', nav: '', reasoning: '', text: '', strong: ''
});

const MATRIX = Object.freeze({
  frame: `${ESC}38;5;22m`,
  inactive: `${ESC}38;5;28m`,
  healthy: `${ESC}92m`,
  thinking: `${ESC}38;5;118m`,
  tool: `${ESC}38;5;82m`,
  approval: `${ESC}38;5;154m`,
  error: `${ESC}38;5;46m`,
  info: `${ESC}38;5;48m`,
  nav: `${ESC}92m`,
  reasoning: `${ESC}38;5;120m`,
  text: `${ESC}38;5;83m`,
  strong: `${ESC}1m`
});

const THEMES = Object.freeze({ color: COLOR, mono: MONO, matrix: MATRIX });

export function themeTokens(theme = 'color') {
  const tokens = THEMES[theme] ?? COLOR;
  return { ...tokens, reset: theme === 'mono' ? '' : RESET, name: THEMES[theme] ? theme : 'color' };
}

export function paint(text, token, theme = 'color') {
  const tokens = themeTokens(theme);
  const prefix = tokens[token] ?? '';
  return prefix ? `${prefix}${text}${tokens.reset}` : String(text ?? '');
}

export function activityToken(activity) {
  if (activity === 'ERROR') return 'error';
  if (activity === 'APPROVAL') return 'approval';
  if (activity === 'TOOL') return 'tool';
  if (activity === 'THINKING') return 'thinking';
  return 'healthy';
}
