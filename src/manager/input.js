const SORT_FIELDS = Object.freeze(['lastActivity', 'context', 'input', 'tools', 'size', 'state', 'project', 'model']);
const SCOPES = Object.freeze(['all', 'live', 'ended']);
const VIEW_MODES = Object.freeze(['operations', 'table', 'charts', 'auto']);

let pendingMouseInput = '';
let pendingMouseInputAt = 0;
let pendingBracketedPaste = '';
let suppressPasteUntil = 0;
const MOUSE_FRAGMENT_TTL_MS = 250;
const RIGHT_CLICK_PASTE_GUARD_MS = 750;
const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

function reassembleManagerMouseInput(value) {
  const now = Date.now();
  let text = String(value ?? '');

  if (pendingMouseInput && now - pendingMouseInputAt > MOUSE_FRAGMENT_TTL_MS) {
    pendingMouseInput = '';
    pendingMouseInputAt = 0;
  }

  if (pendingMouseInput) {
    text = `${pendingMouseInput}${text}`;
    pendingMouseInput = '';
    pendingMouseInputAt = 0;
  }

  // Windows Terminal/ConPTY may split an SGR mouse packet before its final
  // M/m byte. Hold only unambiguously incomplete CSI/SGR mouse fragments so a
  // trailing "M" can never be mistaken for the Manager's Storage shortcut.
  if (text === '\x1b[' || /^\x1b\[<[0-9;]*$/.test(text)) {
    pendingMouseInput = text;
    pendingMouseInputAt = now;
    return null;
  }

  return text;
}

function unwrapBracketedPaste(value) {
  let text = String(value ?? '');
  if (pendingBracketedPaste) {
    text = `${pendingBracketedPaste}${text}`;
    pendingBracketedPaste = '';
  }

  if (!text.startsWith(BRACKETED_PASTE_START)) return { text, paste: false };
  const endIndex = text.indexOf(BRACKETED_PASTE_END, BRACKETED_PASTE_START.length);
  if (endIndex < 0) {
    pendingBracketedPaste = text;
    return null;
  }

  const payload = text.slice(BRACKETED_PASTE_START.length, endIndex);
  const tail = text.slice(endIndex + BRACKETED_PASTE_END.length);
  return { text: `${payload}${tail}`, paste: true };
}

export function resetManagerInputFraming() {
  pendingMouseInput = '';
  pendingMouseInputAt = 0;
  pendingBracketedPaste = '';
  suppressPasteUntil = 0;
}

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

export function normalizeManagerInput(data, {
  searching = false,
  confirmingDelete = false,
  storageOpen = false,
  configOpen = false,
  configPreviewOpen = false,
  configPreviewAvailable = false
} = {}) {
  const rawText = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
  if (!rawText) return null;

  const framedMouse = reassembleManagerMouseInput(rawText);
  if (!framedMouse) return null;
  const pasteResult = unwrapBracketedPaste(framedMouse);
  if (!pasteResult) return null;
  if (pasteResult.paste && Date.now() <= suppressPasteUntil) {
    suppressPasteUntil = 0;
    return null;
  }
  const text = pasteResult.text;
  if (!text) return null;

  if (configPreviewOpen) {
    if (text === '\x1b' || text.toLowerCase() === 'q') return 'config-preview-close';
    if (text.toLowerCase() === 'p') return 'config-preview-live';
    if (text.toLowerCase() === 'm') return 'config-preview-manager';
    return null;
  }

  if (confirmingDelete) {
    if (text === '\x1b' || text.toLowerCase() === 'n' || text.toLowerCase() === 'q') return 'delete-cancel';
    if (text.toLowerCase() === 'y') return 'delete-confirm';
    return null;
  }

  if (configOpen) {
    if (text === '\x1b' || text.toLowerCase() === 'q' || text.toLowerCase() === 'c') return 'config-close';
    if (text === '\x1b[A') return 'up';
    if (text === '\x1b[B') return 'down';
    if (text === '\x1b[C' || text === '\t') return 'config-tab-next';
    if (text === '\x1b[D') return 'config-tab-prev';
    if (text === '\x1b[H' || text === '\x1b[1~' || text === '\x1bOH') return 'home';
    if (text === '\x1b[F' || text === '\x1b[4~' || text === '\x1bOF') return 'end';
    if (/^[\r\n]+$/.test(text) || text === ' ') return 'config-edit';
    if (text.toLowerCase() === 's') return 'config-save';
    if (text.toLowerCase() === 'r') return 'config-revert';
    if (configPreviewAvailable && text.toLowerCase() === 'p') return 'config-preview-live';
    if (configPreviewAvailable && text.toLowerCase() === 'm') return 'config-preview-manager';
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

  const mouse = text.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (mouse) {
    const button = Number(mouse[1]);
    const release = mouse[4] === 'm';
    if (release) return null;

    const plainButton = button & ~0x1c;
    if (plainButton === 64) return 'up';
    if (plainButton === 65) return 'down';
    if (plainButton === 0) return null;
    if (plainButton === 1) return 'view';
    if (plainButton === 2) {
      suppressPasteUntil = Date.now() + RIGHT_CLICK_PASTE_GUARD_MS;
      return 'inspect';
    }
    return null;
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
  if (storageOpen && text.toLowerCase() === 'd') return 'delete-scope';
  if (text === '/') return 'search';
  if (text.toLowerCase() === 'f') return 'filter';
  if (text.toLowerCase() === 's') return 'sort';
  if (text.toLowerCase() === 'd') return 'direction';
  if (text.toLowerCase() === 'r') return 'direction';
  if (text.toLowerCase() === 'v') return 'view';
  if (text.toLowerCase() === 'm') return 'storage-view';
  if (text === 'A' || text === 'a') return 'select-all';
  if (text === 'N' || text === 'n') return 'select-none';
  if (text === 'I' || text === 'i') return 'select-invert';
  if (text === 'C' || text === 'c') return storageOpen ? 'delete-selected' : 'config-view';
  return null;
}

export {
  SORT_FIELDS as MANAGER_SORT_FIELDS,
  SCOPES as MANAGER_SCOPES,
  VIEW_MODES as MANAGER_VIEW_MODES
};
