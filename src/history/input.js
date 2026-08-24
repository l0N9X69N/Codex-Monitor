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
  if (text.toLowerCase() === 's') return 'storage';
  if (text === '\r' || text === '\n') return 'select';
  const mouse = text.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (mouse) {
    const button = Number(mouse[1]);
    if (button === 64) return 'up';
    if (button === 65) return 'down';
    return { action: 'mouse', button, x: Number(mouse[2]), y: Number(mouse[3]), release: mouse[4] === 'm' };
  }
  return null;
}
