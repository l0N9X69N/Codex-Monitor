const ANSI_RE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g;

export function stripAnsi(value = '') {
  return String(value ?? '').replace(ANSI_RE, '');
}

function isCombining(codePoint) {
  return (codePoint >= 0x0300 && codePoint <= 0x036f)
    || (codePoint >= 0x1ab0 && codePoint <= 0x1aff)
    || (codePoint >= 0x1dc0 && codePoint <= 0x1dff)
    || (codePoint >= 0x20d0 && codePoint <= 0x20ff)
    || (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
    || codePoint === 0xfe0f;
}

function isWide(codePoint) {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f
    || codePoint === 0x2329 || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff)
    || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

export function cellWidth(value = '') {
  let width = 0;
  for (const symbol of stripAnsi(value)) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint == null || codePoint === 0 || codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) continue;
    if (isCombining(codePoint)) continue;
    width += isWide(codePoint) ? 2 : 1;
  }
  return width;
}

export function truncateCells(value, maxCells, suffix = '…') {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ');
  if (!Number.isFinite(maxCells) || maxCells <= 0) return '';
  if (cellWidth(text) <= maxCells) return text;
  const suffixWidth = cellWidth(suffix);
  const budget = Math.max(0, maxCells - suffixWidth);
  let out = '';
  let used = 0;
  for (const symbol of text) {
    const width = cellWidth(symbol);
    if (used + width > budget) break;
    out += symbol;
    used += width;
  }
  return `${out}${suffixWidth <= maxCells ? suffix : ''}`;
}

export function padCells(value, targetCells) {
  const text = String(value ?? '');
  return `${text}${' '.repeat(Math.max(0, targetCells - cellWidth(text)))}`;
}
