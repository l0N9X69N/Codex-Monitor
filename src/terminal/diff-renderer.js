const ESC = '\x1b';

function normalizeLines(frame) {
  if (Array.isArray(frame)) return frame.map((line) => String(line ?? ''));
  return String(frame ?? '').split('\n');
}

function rowWrite(row, text) {
  return `${ESC}[${row};1H${text}${ESC}[K`;
}

function repaintFrame(nextFrame, { originRow = 1 } = {}) {
  const next = normalizeLines(nextFrame);
  const dirtyRows = [];
  let output = '';

  for (let index = 0; index < next.length; index += 1) {
    dirtyRows.push(index);
    output += rowWrite(originRow + index, next[index] ?? '');
  }

  return { output, dirtyRows, next };
}

export function diffFrames(previousFrame, nextFrame, { originRow = 1 } = {}) {
  const previous = normalizeLines(previousFrame);
  const next = normalizeLines(nextFrame);
  const rowCount = Math.max(previous.length, next.length);
  const dirtyRows = [];
  let output = '';

  for (let index = 0; index < rowCount; index += 1) {
    const before = previous[index] ?? '';
    const after = next[index] ?? '';
    if (before === after) continue;
    dirtyRows.push(index);
    output += rowWrite(originRow + index, after);
  }

  return { output, dirtyRows, previous, next };
}

export class AnsiDiffRenderer {
  constructor({
    stdout = process.stdout,
    instrumentation = null,
    originRow = 1,
    now = () => Date.now()
  } = {}) {
    this.stdout = stdout;
    this.instrumentation = instrumentation;
    this.originRow = originRow;
    this.now = now;
    this.previous = [];
    this.forceNext = false;
  }

  render(frame) {
    const started = this.now();
    const diff = this.forceNext
      ? repaintFrame(frame, { originRow: this.originRow })
      : diffFrames(this.previous, frame, { originRow: this.originRow });
    this.forceNext = false;
    if (!diff.output) {
      this.previous = diff.next;
      return { written: false, bytes: 0, dirtyRows: [] };
    }

    this.stdout.write(diff.output);
    const bytes = Buffer.byteLength(diff.output, 'utf8');
    const durationMs = Math.max(0, this.now() - started);
    this.previous = diff.next;
    this.instrumentation?.recordRepaint?.(bytes, durationMs);
    return { written: true, bytes, dirtyRows: diff.dirtyRows };
  }

  reset(frame = []) {
    this.previous = normalizeLines(frame);
    this.forceNext = true;
  }
}
