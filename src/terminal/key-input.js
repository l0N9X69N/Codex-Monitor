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
  const onKeypress = (str, key) => {
    const raw = rawForKey(str, key);
    if (raw != null) onInput(raw, key ?? null);
  };
  stream.on('keypress', onKeypress);
  return () => {
    try { stream.off?.('keypress', onKeypress); } catch {}
  };
}

export { isReadableInputStream, rawForKey as terminalRawForKey };
