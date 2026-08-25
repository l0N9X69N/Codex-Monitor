const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;

// Color theme intentionally follows the proven feat/full-monitor-v2 visual
// language. Only presentation is shared: the current normalized-state,
// current-run and passive-input semantics remain authoritative.
const COLOR = Object.freeze({
  frame: `${ESC}38;2;71;85;105m`,
  inactive: `${ESC}38;2;100;116;139m`,
  label: `${ESC}38;2;100;116;139m`,
  muted: `${ESC}38;2;148;163;184m`,
  bright: `${ESC}38;2;226;232;240m`,
  healthy: `${ESC}38;2;34;197;94m`,
  thinking: `${ESC}38;2;250;204;21m`,
  tool: `${ESC}38;2;96;165;250m`,
  approval: `${ESC}38;2;245;158;11m`,
  error: `${ESC}38;2;239;68;68m`,
  info: `${ESC}38;2;34;211;238m`,
  nav: `${ESC}38;2;34;211;238m`,
  reasoning: `${ESC}38;2;192;132;252m`,
  text: `${ESC}38;2;226;232;240m`,
  strong: BOLD
});

const MONO = Object.freeze({
  frame: '', inactive: '', label: '', muted: '', bright: '', healthy: '', thinking: '',
  tool: '', approval: '', error: '', info: '', nav: '', reasoning: '', text: '', strong: BOLD
});

const MATRIX = Object.freeze({
  frame: `${ESC}38;5;22m`,
  inactive: `${ESC}38;5;28m`,
  label: `${ESC}38;5;28m`,
  muted: `${ESC}38;5;35m`,
  bright: `${ESC}38;5;120m`,
  healthy: `${ESC}92m`,
  thinking: `${ESC}38;5;118m`,
  tool: `${ESC}38;5;82m`,
  approval: `${ESC}38;5;154m`,
  error: `${ESC}38;5;46m`,
  info: `${ESC}38;5;48m`,
  nav: `${ESC}92m`,
  reasoning: `${ESC}38;5;120m`,
  text: `${ESC}38;5;83m`,
  strong: BOLD
});

const THEMES = Object.freeze({ color: COLOR, mono: MONO, matrix: MATRIX });

export function themeTokens(theme = 'color') {
  const tokens = THEMES[theme] ?? COLOR;
  return { ...tokens, reset: RESET, name: THEMES[theme] ? theme : 'color' };
}

export function paint(text, token, theme = 'color') {
  const tokens = themeTokens(theme);
  const prefix = tokens[token] ?? '';
  return prefix ? `${prefix}${text}${tokens.reset}` : String(text ?? '');
}

export function styleText(text, token = 'text', theme = 'color', { bold = false } = {}) {
  const tokens = themeTokens(theme);
  const prefix = `${bold ? tokens.strong : ''}${tokens[token] ?? ''}`;
  return prefix ? `${prefix}${text}${tokens.reset}` : String(text ?? '');
}

export function activityToken(activity) {
  if (activity === 'ERROR') return 'error';
  if (activity === 'APPROVAL') return 'approval';
  if (activity === 'TOOL') return 'tool';
  if (activity === 'THINKING') return 'thinking';
  return 'healthy';
}
