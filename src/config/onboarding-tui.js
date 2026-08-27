import process from 'node:process';
import { detectHistoryColorMode } from '../history/theme.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';
import { TerminalGuard } from '../terminal/guard.js';
import { OnboardingController, ONBOARDING_STEP } from './onboarding.js';
import { renderOnboarding } from './onboarding-render.js';

function paintMode(theme, capability) {
  const normalized = String(theme ?? 'color').toLowerCase();
  if (normalized === 'mono' || capability === 'mono') return 'mono';
  if (normalized === 'matrix') return `matrix:${capability}`;
  return capability;
}

function actionForInput(data) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
  if (!text) return null;
  if (text === '\x1b') return 'cancel';
  if (text === '\x1b[A') return 'up';
  if (text === '\x1b[B') return 'down';
  if (text === '\x1b[D' || text === '\x7f' || text === '\b') return 'back';
  if (text === '\x1b[C') return 'forward';
  if (/^[\r\n]+$/.test(text) || text === ' ') return 'activate';
  return null;
}

export async function runFirstRunOnboarding({
  stdin = process.stdin,
  stdout = process.stdout,
  processRef = process,
  currentConfig,
  previousConfig = currentConfig,
  filePath,
  save,
  applyArchiveEffects,
  controller = null,
  colorCapability = detectHistoryColorMode()
} = {}) {
  if (!stdin?.isTTY || !stdout?.isTTY) {
    return { code: 0, saved: false, cancelled: false, skipped: true, config: currentConfig, error: null };
  }

  const activeController = controller ?? new OnboardingController({ currentConfig, previousConfig, filePath, save, applyArchiveEffects });
  const guard = new TerminalGuard({ stdin, stdout });
  const renderer = new AnsiDiffRenderer({ stdout, originRow: 1 });
  let done = false;
  let finish;
  let fail;
  const finished = new Promise((resolve, reject) => { finish = resolve; fail = reject; });

  const draw = (force = false) => {
    const width = Math.max(44, stdout.columns || 100);
    const height = Math.max(16, stdout.rows || 30);
    const mode = paintMode(activeController.draftConfig?.theme, colorCapability);
    const frame = renderOnboarding({ controller: activeController, width, height, mode });
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

  const complete = (result) => {
    cleanup();
    finish({ code: result.saved ? 0 : result.cancelled ? 1 : 0, skipped: false, ...result, error: result.error ?? null });
  };

  const abort = (error) => {
    if (done) return;
    cleanup();
    fail(error);
  };

  const handle = (data) => {
    const action = actionForInput(data);
    if (!action) return;
    if (action === 'cancel') {
      complete(activeController.cancel());
      return;
    }
    if (action === 'back') {
      activeController.back();
      draw(true);
      return;
    }
    if (action === 'up') activeController.moveCursor(-1);
    else if (action === 'down') activeController.moveCursor(1);
    else if (action === 'activate' || action === 'forward') {
      const result = activeController.activateCurrent(action === 'forward' ? 1 : 1);
      if (activeController.step === ONBOARDING_STEP.SUMMARY && result?.saved) {
        complete(result);
        return;
      }
      if (result?.saved || result?.error) {
        if (result.saved) complete(result);
      }
    }
    draw(false);
  };

  const onInput = (data) => { try { handle(data); } catch (error) { abort(error); } };
  const onResize = () => { try { draw(true); } catch (error) { abort(error); } };
  const onSignal = () => complete(activeController.cancel());

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
