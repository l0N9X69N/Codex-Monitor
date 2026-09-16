const ESC = '\x1b';

export class TerminalGuard {
  constructor({ stdin = process.stdin, stdout = process.stdout } = {}) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.initialRaw = Boolean(stdin?.isRaw);
    this.rawModeChanged = false;
    this.cursorHidden = false;
    this.scrollRegionModified = false;
    this.mouseEnabled = false;
    this.alternateScrollEnabled = false;
    this.alternateScreen = false;
    this.restored = false;
  }

  write(sequence) {
    try { this.stdout?.write?.(sequence); } catch {}
  }

  enterRawMode() {
    if (!this.stdin?.isTTY || typeof this.stdin?.setRawMode !== 'function') return false;
    this.stdin.setRawMode(true);
    this.rawModeChanged = true;
    return true;
  }

  hideCursor() {
    this.write(`${ESC}[?25l`);
    this.cursorHidden = true;
  }

  setScrollRegion(top, bottom) {
    this.write(`${ESC}[${top};${bottom}r`);
    this.scrollRegionModified = true;
  }

  enableMouse() {
    // X10 tracking reports button presses (including wheel extensions) but not
    // button-release packets. Pair it with SGR coordinates so Manager can keep
    // explicit left/middle/right/wheel shortcuts without a delayed release
    // packet being split by Windows/ConPTY into ESC + ... + M/m and leaking into
    // normal keyboard shortcuts after an Inspect screen is opened.
    this.write(
      `${ESC}[?1007l` +
      `${ESC}[?1000l${ESC}[?1002l${ESC}[?1003l` +
      `${ESC}[?9h${ESC}[?1006h`
    );
    this.mouseEnabled = true;
    this.alternateScrollEnabled = false;
  }

  enterAlternateScreen() {
    this.write(`${ESC}[?1049h`);
    this.alternateScreen = true;
  }

  restore() {
    if (this.restored) return false;
    this.restored = true;

    let sequence = '';
    if (this.mouseEnabled) sequence += `${ESC}[?9l${ESC}[?1000l${ESC}[?1002l${ESC}[?1003l${ESC}[?1006l`;
    if (this.alternateScrollEnabled) sequence += `${ESC}[?1007l`;
    if (this.cursorHidden) sequence += `${ESC}[?25h`;
    if (this.scrollRegionModified) sequence += `${ESC}[r`;
    if (this.alternateScreen) sequence += `${ESC}[?1049l`;
    if (sequence) this.write(sequence);

    if (this.rawModeChanged && typeof this.stdin?.setRawMode === 'function') {
      try { this.stdin.setRawMode(this.initialRaw); } catch {}
    }
    return true;
  }
}