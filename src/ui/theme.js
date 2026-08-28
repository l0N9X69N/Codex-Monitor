const ESC = '\x1b[';
const RESET_FG = `${ESC}39m`;
const RESET_STYLE = `${ESC}22;39m`;
const RESET_ALL = `${ESC}0m`;
const BOLD = `${ESC}1m`;

// Balanced everyday color palette: colored structure and semantic values without
// the saturation of Cyberpunk. This remains the default Monitor theme.
const COLOR = Object.freeze({
  frame: `${ESC}38;2;69;91;120m`,
  inactive: `${ESC}38;2;111;126;148m`,
  label: `${ESC}38;2;139;151;170m`,
  muted: `${ESC}38;2;156;164;180m`,
  bright: `${ESC}38;2;226;232;240m`,
  healthy: `${ESC}38;2;105;194;139m`,
  thinking: `${ESC}38;2;210;181;101m`,
  tool: `${ESC}38;2;116;180;210m`,
  approval: `${ESC}38;2;211;151;87m`,
  error: `${ESC}38;2;220;103;108m`,
  info: `${ESC}38;2;116;190;222m`,
  nav: `${ESC}38;2;132;184;214m`,
  reasoning: `${ESC}38;2;180;151;207m`,
  text: `${ESC}38;2;226;232;240m`,
  strong: BOLD
});

const CYBERPUNK = Object.freeze({
  frame: `${ESC}38;2;27;103;123m`,
  inactive: `${ESC}38;2;103;112;141m`,
  label: `${ESC}38;2;174;166;205m`,
  muted: `${ESC}38;2;135;139;164m`,
  bright: `${ESC}38;2;240;249;255m`,
  healthy: `${ESC}38;2;57;255;136m`,
  thinking: `${ESC}38;2;250;204;21m`,
  tool: `${ESC}38;2;34;211;238m`,
  approval: `${ESC}38;2;255;171;64m`,
  error: `${ESC}38;2;255;75;110m`,
  info: `${ESC}38;2;34;211;238m`,
  nav: `${ESC}38;2;232;121;249m`,
  reasoning: `${ESC}38;2;192;132;252m`,
  text: `${ESC}38;2;240;249;255m`,
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

const BACKGROUNDS = Object.freeze({
  terminal: '',
  black: `${ESC}48;2;0;0;0m`,
  dark: `${ESC}48;2;15;23;42m`
});

const THEMES = Object.freeze({ color: COLOR, cyberpunk: CYBERPUNK, mono: MONO, matrix: MATRIX });

export function themeTokens(theme = 'color') {
  const tokens = THEMES[theme] ?? COLOR;
  return { ...tokens, reset: RESET_STYLE, name: THEMES[theme] ? theme : 'color' };
}

export function paint(text, token, theme = 'color') {
  const tokens = themeTokens(theme);
  const prefix = tokens[token] ?? '';
  return prefix ? `${prefix}${text}${RESET_FG}` : String(text ?? '');
}

export function styleText(text, token = 'text', theme = 'color', { bold = false } = {}) {
  const tokens = themeTokens(theme);
  const prefix = `${bold ? tokens.strong : ''}${tokens[token] ?? ''}`;
  return prefix ? `${prefix}${text}${RESET_STYLE}` : String(text ?? '');
}

export function applyLineBackground(text, background = 'terminal') {
  const prefix = BACKGROUNDS[background] ?? '';
  return prefix ? `${prefix}${text}${RESET_ALL}` : String(text ?? '');
}

export function backgroundToken(background = 'terminal') {
  return BACKGROUNDS[background] ?? '';
}

export function activityToken(activity) {
  if (activity === 'ERROR') return 'error';
  if (activity === 'APPROVAL') return 'approval';
  if (activity === 'TOOL') return 'tool';
  if (activity === 'THINKING') return 'thinking';
  return 'healthy';
}
