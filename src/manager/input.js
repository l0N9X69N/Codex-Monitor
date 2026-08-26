const SORT_FIELDS = Object.freeze(['lastActivity', 'context', 'input', 'tools', 'size', 'state', 'project', 'model']);
const SCOPES = Object.freeze(['all', 'live', 'ended']);
const VIEW_MODES = Object.freeze(['operations', 'table', 'charts', 'auto']);

export function nextManagerScope(scope = 'all') {
  const index = SCOPES.indexOf(String(scope).toLowerCase());
  return SCOPES[(index < 0 ? 0 : index + 1) % SCOPES.length];
}

export function nextManagerSort(sortBy = 'lastActivity') {
  const index = SORT_FIELDS.indexOf(String(sortBy));
  return SORT_FIELDS[(index < 0 ? 0 : index + 1) % SORT_FIELDS.length];
}

export function nextManagerView(view = 'operations') {
  const index = VIEW_MODES.indexOf(String(view).toLowerCase());
  return VIEW_MODES[(index < 0 ? 0 : index + 1) % VIEW_MODES.length];
}

export function normalizeManagerInput(data, { searching = false } = {}) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
  if (!text) return null;

  if (text === '\x1b[A') return 'up';
  if (text === '\x1b[B') return 'down';
  if (text === '\x1b[C') return 'right';
  if (text === '\x1b[D') return 'left';
  if (text === '\t') return 'tab';

  const mouse = text.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (mouse) {
    const button = Number(mouse[1]);
    if (button === 64) return 'up';
    if (button === 65) return 'down';
    return {
      action: 'mouse',
      button,
      x: Number(mouse[2]),
      y: Number(mouse[3]),
      release: mouse[4] === 'm'
    };
  }

  if (searching) {
    if (text === '\x1b') return 'search-cancel';
    if (text === '\r' || text === '\n') return 'search-accept';
    if (text === '\x7f' || text === '\b') return 'search-backspace';
    const printable = [...text].filter((symbol) => {
      const code = symbol.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    }).join('');
    return printable ? { action: 'search-text', text: printable } : null;
  }

  if (text === '\x1b' || text.toLowerCase() === 'q') return 'quit';
  if (text === '\r' || text === '\n') return 'inspect';
  if (text === '/') return 'search';
  if (text.toLowerCase() === 'f') return 'filter';
  if (text.toLowerCase() === 's') return 'sort';
  if (text.toLowerCase() === 'd') return 'direction';
  if (text.toLowerCase() === 'v') return 'view';
  return null;
}

export {
  SORT_FIELDS as MANAGER_SORT_FIELDS,
  SCOPES as MANAGER_SCOPES,
  VIEW_MODES as MANAGER_VIEW_MODES
};
