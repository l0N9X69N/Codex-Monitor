import process from 'node:process';
import { detectHistoryColorMode } from '../history/theme.js';
import { ManagerConfigController } from '../manager/config-controller.js';
import { renderManagerConfig } from '../manager/config-render.js';
import { normalizeManagerInput } from '../manager/input.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';
import { TerminalGuard } from '../terminal/guard.js';

function configPaintMode(theme, capability) {
  const normalized = String(theme ?? 'color').toLowerCase();
  if (normalized === 'mono' || capability === 'mono') return 'mono';
  if (normalized === 'matrix') return `matrix:${capability}`;
  return capability;
}

export async function runStandaloneConfigTui({
  stdin = process.stdin,
  stdout = process.stdout,
  processRef = process,
  currentConfig,
  previousConfig = currentConfig,
  filePath,
  save,
  applyArchiveEffects,
  controller = null,
  colorCapability = detectHistoryColorMode(),
  theme = currentConfig?.theme ?? 'color'
} = {}) {
  if (!stdin?.isTTY || !stdout?.isTTY) {
    return {
      code: 2,
      saved: false,
      cancelled: true,
      config: currentConfig,
      error: new Error('Interactive Config requires a TTY; no prompt was started.')
    };
  }

  const activeController = controller ?? new ManagerConfigController({
    config: currentConfig,
    filePath,
    ...(save ? { save } : {}),
    ...(applyArchiveEffects ? { applyArchiveEffects } : {})
  });
  if (previousConfig != null) activeController.savedConfig = JSON.parse(JSON.stringify(previousConfig));
  activeController.draftConfig = JSON.parse(JSON.stringify(currentConfig ?? activeController.savedConfig));

  const mode = configPaintMode(theme, colorCapability);
  const guard = new TerminalGuard({ stdin, stdout });
  const renderer = new AnsiDiffRenderer({ stdout, originRow: 1 });
  let done = false;
  let saved = false;
  let lastSave = null;

  let finish;
  let fail;
  const finished = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });

  const draw = (force = false) => {
    const width = Math.max(44, stdout.columns || 120);
    const height = Math.max(16, stdout.rows || 36);
    const frame = renderManagerConfig({ controller: activeController, width, height, mode });
    if (force) renderer.reset([]);
    renderer.render(frame.lines);
    return frame;
  };

  const cleanup = () => {
    if (done) return;
    done = true;
    try { stdin.off?.('data', onInput); } catch {}
    try { stdout.off?.('resize', onResize); } catch {}
    try { stdin.pause?.(); } catch {}
    guard.restore();
  };

  const close = () => {
    cleanup();
    finish({
      code: 0,
      saved,
      cancelled: activeController.dirty,
      config: activeController.savedConfig,
      draftConfig: activeController.draftConfig,
      lastSave,
      error: null
    });
  };

  const abort = (error) => {
    if (done) return;
    cleanup();
    fail(error);
  };

  const handleInput = (data) => {
    if (done) return;
    const normalized = normalizeManagerInput(data, { configOpen: true });
    if (normalized == null) return;
    const action = typeof normalized === 'object' ? normalized.action : normalized;
    if (action === 'config-close') {
      close();
      return;
    }
    if (action === 'config-tab-next') activeController.moveTab(1);
    else if (action === 'config-tab-prev') activeController.moveTab(-1);
    else if (action === 'up') activeController.moveCursor(-1);
    else if (action === 'down') activeController.moveCursor(1);
    else if (action === 'home') activeController.cursorHome();
    else if (action === 'end') activeController.cursorEnd();
    else if (action === 'config-edit') activeController.editCurrent(1);
    else if (action === 'config-revert') activeController.revert();
    else if (action === 'config-save') {
      lastSave = activeController.save();
      saved = saved || lastSave.saved === true;
    }
    draw(action === 'config-save');
  };

  const onInput = (data) => {
    try { handleInput(data); } catch (error) { abort(error); }
  };
  const onResize = () => {
    try { draw(true); } catch (error) { abort(error); }
  };
  const onSignal = () => close();

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
