import readline from 'node:readline';

function rawForKey(str, key = {}) {
  if (key?.ctrl && key?.name === 'c') return '\x03';
  if (key?.name === 'return' || key?.name === 'enter') return '\r';
  if (key?.name === 'escape') return '\x1b';
  if (key?.name === 'up') return '\x1b[A';
  if (key?.name === 'down') return '\x1b[B';
  if (key?.name === 'right') return '\x1b[C';
  if (key?.name === 'left') return '\x1b[D';
  if (key?.name === 'home') return '\x1b[H';
  if (key?.name === 'end') return '\x1b[F';
  if (key?.name === 'backspace') return '\x7f';
  if (key?.name === 'tab') return '\t';
  if (key?.name === 'space') return ' ';
  if (typeof str === 'string' && str.length > 0) return str;
  if (typeof key?.sequence === 'string' && key.sequence.length > 0) return key.sequence;
  return null;
}

function isReadableInputStream(stream) {
  return typeof stream?.read === 'function' && typeof stream?.pipe === 'function';
}

export function attachTerminalKeyInput(stream, onInput) {
  if (!stream?.on || typeof onInput !== 'function') return () => {};

  // Real terminal streams go through Node's keypress decoder so Windows console
  // input is normalized before the TUI sees it. Minimal fake TTYs used by tests
  // are EventEmitters rather than Readable streams; keep their historical
  // direct-data contract without installing both paths and double-dispatching.
  if (!isReadableInputStream(stream)) {
    const onData = (data) => {
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
      if (raw) onInput(raw, null);
    };
    stream.on('data', onData);
    return () => {
      try { stream.off?.('data', onData); } catch {}
    };
  }

  readline.emitKeypressEvents(stream);
  let escapeFallbackTimer = null;
  let lastEscapeKeypressAt = 0;

  const onKeypress = (str, key) => {
    const raw = rawForKey(str, key);
    if (raw == null) return;
    if (raw === '\x1b') {
      lastEscapeKeypressAt = Date.now();
      if (escapeFallbackTimer) {
        clearTimeout(escapeFallbackTimer);
        escapeFallbackTimer = null;
      }
    }
    onInput(raw, key ?? null);
  };

  // A few Windows TTY/ConPTY stacks deliver the raw ESC byte but Node's
  // readline decoder does not always emit a standalone `keypress` for it.
  // Keep a tiny delayed fallback for the exact ESC byte only. Arrow/function
  // sequences are never matched, and the timestamp/timer prevents a normal
  // keypress from being dispatched twice.
  const onData = (data) => {
    const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
    if (raw !== '\x1b') return;
    if (Date.now() - lastEscapeKeypressAt < 50) return;
    if (escapeFallbackTimer) clearTimeout(escapeFallbackTimer);
    escapeFallbackTimer = setTimeout(() => {
      escapeFallbackTimer = null;
      if (Date.now() - lastEscapeKeypressAt < 50) return;
      onInput('\x1b', { name: 'escape', sequence: '\x1b', fallback: true });
    }, 25);
    escapeFallbackTimer.unref?.();
  };

  stream.on('keypress', onKeypress);
  stream.on('data', onData);
  return () => {
    if (escapeFallbackTimer) {
      clearTimeout(escapeFallbackTimer);
      escapeFallbackTimer = null;
    }
    try { stream.off?.('keypress', onKeypress); } catch {}
    try { stream.off?.('data', onData); } catch {}
  };
}

export { isReadableInputStream, rawForKey as terminalRawForKey };
