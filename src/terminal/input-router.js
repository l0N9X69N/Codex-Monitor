import { StringDecoder } from 'node:string_decoder';

export const MONITOR_PREFIX = '\x07'; // Ctrl+G / BEL; reserved by Codex Monitor while Live HUD is active.

// Retained as a compatibility helper for tests/tools that want to inspect common
// terminal sequences. The live router does NOT depend on these sequences because
// terminal emulators and child TUIs can encode function/Alt keys differently.
const DIRECT_HOTKEYS = Object.freeze([
  { sequence: '\x1bOQ', action: 'previous-view' },
  { sequence: '\x1b[12~', action: 'previous-view' },
  { sequence: '\x1bOR', action: 'next-view' },
  { sequence: '\x1b[13~', action: 'next-view' },
  { sequence: '\x1bOS', action: 'history' },
  { sequence: '\x1b[14~', action: 'history' },
  { sequence: '\x1b[1;3D', action: 'previous-view' },
  { sequence: '\x1b[1;9D', action: 'previous-view' },
  { sequence: '\x1b[1;3C', action: 'next-view' },
  { sequence: '\x1b[1;9C', action: 'next-view' }
]);

const PREFIX_COMMANDS = Object.freeze({
  h: 'previous-view',
  l: 'next-view',
  o: 'view:overview',
  p: 'view:performance',
  y: 'view:processes',
  t: 'view:tools',
  r: 'view:resources',
  u: 'view:usage',
  i: 'history'
});

const CONTROL_COMMANDS = Object.freeze({
  '\x08': 'h', // Ctrl+H
  '\x0c': 'l', // Ctrl+L
  '\x0f': 'o', // Ctrl+O
  '\x10': 'p', // Ctrl+P
  '\x19': 'y', // Ctrl+Y
  '\x14': 't', // Ctrl+T
  '\x12': 'r', // Ctrl+R
  '\x15': 'u', // Ctrl+U
  '\x09': 'i'  // Ctrl+I / Tab while command mode is active
});

export function splitMonitorHotkeys(input) {
  const text = String(input ?? '');
  const actions = [];
  let forwarded = '';
  let cursor = 0;

  while (cursor < text.length) {
    const hotkey = DIRECT_HOTKEYS.find((item) => text.startsWith(item.sequence, cursor));
    if (hotkey) {
      actions.push(hotkey.action);
      cursor += hotkey.sequence.length;
      continue;
    }
    forwarded += text[cursor];
    cursor += 1;
  }

  return { actions, forwarded };
}

export class MonitorInputRouter {
  constructor({
    writeChild,
    onAction = null,
    onCommandModeChange = null,
    prefix = MONITOR_PREFIX,
    commandTimeoutMs = 1500,
    decoder = new StringDecoder('utf8'),
    setTimer = setTimeout,
    clearTimer = clearTimeout
  } = {}) {
    if (typeof writeChild !== 'function') throw new Error('MonitorInputRouter requires writeChild');
    this.writeChild = writeChild;
    this.onAction = onAction;
    this.onCommandModeChange = onCommandModeChange;
    this.prefix = prefix;
    this.commandTimeoutMs = Math.max(250, Number(commandTimeoutMs) || 1500);
    this.decoder = decoder;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.commandMode = false;
    this.commandTimer = null;
  }

  clearCommandTimer() {
    if (!this.commandTimer) return;
    this.clearTimer(this.commandTimer);
    this.commandTimer = null;
  }

  armCommandTimer() {
    this.clearCommandTimer();
    this.commandTimer = this.setTimer(() => {
      this.commandTimer = null;
      this.setCommandMode(false);
    }, this.commandTimeoutMs);
    this.commandTimer?.unref?.();
  }

  setCommandMode(active) {
    const next = Boolean(active);
    if (!next) this.clearCommandTimer();
    if (next === this.commandMode) {
      if (next) this.armCommandTimer();
      return false;
    }
    this.commandMode = next;
    if (next) this.armCommandTimer();
    this.onCommandModeChange?.(next);
    return true;
  }

  emitAction(action) {
    if (!action) return false;
    this.onAction?.(action);
    return true;
  }

  // Normal input is deliberately a zero-parser fast path. Function keys, Alt
  // sequences, paste data and ordinary text are passed to Codex exactly as they
  // arrive. Only the single reserved Ctrl+G byte enters Monitor command mode.
  forwardNormal(text) {
    if (text) this.writeChild(text);
  }

  handleCommandCharacter(ch) {
    // Ctrl+G is reserved absolutely while the HUD is active. Key-repeat can emit
    // the prefix more than once, so repeated prefixes are swallowed and simply
    // keep command mode alive. They are NEVER forwarded to Codex.
    if (ch === this.prefix) {
      this.armCommandTimer();
      return;
    }

    // Escape cancels Monitor command mode and is consumed.
    if (ch === '\x1b') {
      this.setCommandMode(false);
      return;
    }

    // Support both "release Ctrl, press L" and "keep Ctrl held, press Ctrl+L".
    const normalized = CONTROL_COMMANDS[ch] ?? ch.toLowerCase();
    const action = PREFIX_COMMANDS[normalized] ?? null;
    this.setCommandMode(false);

    if (action) {
      this.emitAction(action);
      return;
    }

    // Unknown command: the Monitor prefix remains consumed, but preserve a
    // printable command character so an accidental prefix does not eat typing.
    // Unknown control characters are consumed instead of leaking shortcuts into
    // the child TUI.
    if (ch >= ' ' && ch !== '\x7f') this.writeChild(ch);
  }

  feed(data) {
    const text = Buffer.isBuffer(data) || ArrayBuffer.isView(data)
      ? this.decoder.write(data)
      : String(data ?? '');
    if (!text) return;

    let cursor = 0;
    while (cursor < text.length) {
      if (this.commandMode) {
        const codePoint = text.codePointAt(cursor);
        const ch = String.fromCodePoint(codePoint);
        cursor += ch.length;
        this.handleCommandCharacter(ch);
        continue;
      }

      const prefixIndex = text.indexOf(this.prefix, cursor);
      if (prefixIndex === -1) {
        this.forwardNormal(text.slice(cursor));
        break;
      }

      if (prefixIndex > cursor) this.forwardNormal(text.slice(cursor, prefixIndex));
      this.setCommandMode(true);
      cursor = prefixIndex + this.prefix.length;
    }
  }

  dispose() {
    this.setCommandMode(false);
    const tail = this.decoder.end();
    if (tail) this.forwardNormal(tail);
  }
}
