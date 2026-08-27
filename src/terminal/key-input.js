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

export function attachTerminalKeyInput(stream, onInput) {
  if (!stream?.on || typeof onInput !== 'function') return () => {};
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

export { rawForKey as terminalRawForKey };
