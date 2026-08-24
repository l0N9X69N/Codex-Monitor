export function normalizeHistoryInput(data) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
  if (!text) return null;
  if (text === '\x1b[A') return 'up';
  if (text === '\x1b[B') return 'down';
  if (text === '\x1b[C') return 'right';
  if (text === '\x1b[D') return 'left';
  if (text === '\x1b' || text.toLowerCase() === 'q') return 'quit';
  if (text.toLowerCase() === 'r') return 'refresh';
  if (text.toLowerCase() === 't') return 'tail';
  if (text === '\r' || text === '\n') return 'select';
  if (text.startsWith('\x1b[<')) return 'mouse';
  return null;
}
