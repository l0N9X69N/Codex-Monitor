const SORT_FIELDS = Object.freeze(['lastActivity', 'context', 'input', 'tools', 'size', 'state', 'project', 'model']);
const SCOPES = Object.freeze(['all', 'live', 'ended']);
const VIEW_MODES = Object.freeze(['operations', 'table', 'charts', 'storage', 'auto']);

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

export function normalizeManagerInput(data, { searching = false, confirmingDelete = false } = {}) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
  if (!text) return null;

  if (confirmingDelete) {
    if (text === '\x1b' || text.toLowerCase() === 'n' || text.toLowerCase() === 'q') return 'delete-cancel';
    if (text.toLowerCase() === 'y') return 'delete-confirm';
    return null;
  }

  if (text === '\x1b[A') return 'up';
  if (text === '\x1b[B') return 'down';
  if (text === '\x1b[C') return 'right';
  if (text === '\x1b[D') return 'left';
  if (text === '\x1b[5~') return 'page-up';
  if (text === '\x1b[6~') return 'page-down';
  if (text === '\x1b[H' || text === '\x1b[1~' || text === '\x1bOH') return 'home';
  if (text === '\x1b[F' || text === '\x1b[4~' || text === '\x1bOF') return 'end';
  if (text === '\t') return 'tab';

  const mouse = text.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (mouse) {
    const button = Number(mouse[1]);
    if (button === 64) return 'up';
    if (button === 65) return 'down';
    return { action: 'mouse', button, x: Number(mouse[2]), y: Number(mouse[3]), release: mouse[4] === 'm' };
  }

  const enter = /^[\r\n]+$/.test(text);

  if (searching) {
    if (text === '\x1b') return 'search-cancel';
    if (enter) return 'search-accept';
    if (text === '\x7f' || text === '\b') return 'search-backspace';
    const printable = [...text].filter((symbol) => {
      const code = symbol.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    }).join('');
    return printable ? { action: 'search-text', text: printable } : null;
  }

  if (text === '\x1b' || text.toLowerCase() === 'q') return 'quit';
  if (enter) return 'inspect';
  if (text === ' ') return 'select-toggle';
  if (text === '/') return 'search';
  if (text.toLowerCase() === 'f') return 'filter';
  if (text.toLowerCase() === 's') return 'sort';
  if (text.toLowerCase() === 'd') return 'direction';
  if (text.toLowerCase() === 'r') return 'direction';
  if (text.toLowerCase() === 'v') return 'view';
  if (text === 'A' || text === 'a') return 'select-all';
  if (text === 'N' || text === 'n') return 'select-none';
  if (text === 'I' || text === 'i') return 'select-invert';
  if (text === 'C' || text === 'c') return 'delete-selected';
  return null;
}

export {
  SORT_FIELDS as MANAGER_SORT_FIELDS,
  SCOPES as MANAGER_SCOPES,
  VIEW_MODES as MANAGER_VIEW_MODES
};
