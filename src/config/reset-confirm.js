import process from 'node:process';
import { hpaint, detectHistoryColorMode } from '../history/theme.js';
import { truncateCells } from '../ui/cell-width.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';
import { TerminalGuard } from '../terminal/guard.js';

function paintMode(capability) {
  return capability === 'mono' ? 'mono' : capability;
}

function renderResetConfirm({ width = 100, height = 24, mode = 'mono', archiveEnabled = false } = {}) {
  const safeWidth = Math.max(44, Number(width) || 100);
  const safeHeight = Math.max(16, Number(height) || 24);
  const lines = [
    hpaint('CODEX MONITOR · RESET', 'heading', mode),
    hpaint('─'.repeat(safeWidth), 'grid', mode),
    '',
    hpaint('Reset Codex Monitor preferences?', 'strong', mode),
    '',
    'This does NOT remove:',
    '  - Codex login/auth',
    '  - Codex sessions/history',
    '  - Local Session Archive SQLite data',
    '  - project files or Git state',
    '',
    archiveEnabled
      ? hpaint('Archive background indexing will be disabled after you Save the reset defaults.', 'pressure', mode)
      : 'Archive data remains untouched.',
    '',
    hpaint('Y / Enter  Continue to reset defaults', 'nav', mode),
    'N / Esc    Cancel'
  ];
  while (lines.length < safeHeight - 1) lines.push('');
  lines.push(hpaint('Confirmation only · defaults are still not written until Config Save.', 'dim', mode));
  return { lines: lines.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, '')) };
}

export async function confirmMonitorReset({
  stdin = process.stdin,
  stdout = process.stdout,
  processRef = process,
  archiveEnabled = false,
  colorCapability = detectHistoryColorMode()
} = {}) {
  if (!stdin?.isTTY || !stdout?.isTTY) {
    return { confirmed: false, code: 2, error: new Error('Monitor reset confirmation requires an interactive TTY.') };
  }

  const guard = new TerminalGuard({ stdin, stdout });
  const renderer = new AnsiDiffRenderer({ stdout, originRow: 1 });
  const mode = paintMode(colorCapability);
  let done = false;
  let finish;
  let fail;
  const finished = new Promise((resolve, reject) => { finish = resolve; fail = reject; });

  const draw = (force = false) => {
    const frame = renderResetConfirm({
      width: Math.max(44, stdout.columns || 100),
      height: Math.max(16, stdout.rows || 24),
      mode,
      archiveEnabled
    });
    if (force) renderer.reset([]);
    renderer.render(frame.lines);
  };

  const cleanup = () => {
    if (done) return;
    done = true;
    try { stdin.off?.('data', onInput); } catch {}
    try { stdout.off?.('resize', onResize); } catch {}
    try { stdin.pause?.(); } catch {}
    guard.restore();
  };

  const complete = (confirmed) => {
    cleanup();
    finish({ confirmed, code: confirmed ? 0 : 1, error: null });
  };

  const abort = (error) => {
    if (done) return;
    cleanup();
    fail(error);
  };

  const onInput = (data) => {
    try {
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
      if (/^[\r\n]+$/.test(text) || text.toLowerCase() === 'y') complete(true);
      else if (text === '\x1b' || text.toLowerCase() === 'n' || text.toLowerCase() === 'q') complete(false);
    } catch (error) { abort(error); }
  };
  const onResize = () => { try { draw(true); } catch (error) { abort(error); } };
  const onSignal = () => complete(false);

  processRef?.once?.('SIGINT', onSignal);
  processRef?.once?.('SIGTERM', onSignal);
  try {
    guard.enterAlternateScreen();
    guard.hideCursor();
    guard.enterRawMode();
    stdin.resume?.();
    stdin.on?.('data', onInput);
    stdout.on?.('resize', onResize);
    stdout.write('\x1b[2J\x1b[H');
    draw(true);
    return await finished;
  } finally {
    processRef?.removeListener?.('SIGINT', onSignal);
    processRef?.removeListener?.('SIGTERM', onSignal);
    if (!done) cleanup();
  }
}

export { renderResetConfirm };
