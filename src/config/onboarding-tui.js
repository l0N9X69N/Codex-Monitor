import process from 'node:process';
import { detectHistoryColorMode } from '../history/theme.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';
import { TerminalGuard } from '../terminal/guard.js';
import { attachTerminalKeyInput } from '../terminal/key-input.js';
import { OnboardingController, ONBOARDING_STEP } from './onboarding.js';
import { renderOnboarding } from './onboarding-render.js';
import { renderConfigPreview } from './preview.js';

function paintMode(theme, capability) {
  const normalized = String(theme ?? 'color').toLowerCase();
  if (normalized === 'mono' || capability === 'mono') return 'mono';
  if (normalized === 'cyberpunk') return `cyberpunk:${capability}`;
  if (normalized === 'matrix') return `matrix:${capability}`;
  return capability;
}

function actionForInput(data, { previewOpen = false } = {}) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
  if (!text) return null;
  if (previewOpen) {
    if (text === '\x1b' || text.toLowerCase() === 'q' || text === '\x03') return 'preview-close';
    if (text.toLowerCase() === 'p') return 'preview-live';
    if (text.toLowerCase() === 'm') return 'preview-manager';
    return null;
  }
  if (text === '\x1b' || text === '\x03') return 'cancel';
  if (text === '\x1b[A') return 'up';
  if (text === '\x1b[B') return 'down';
  if (text === '\x1b[D' || text === '\x7f' || text === '\b') return 'back';
  if (text === '\x1b[C') return 'forward';
  if (text.toLowerCase() === 'p') return 'preview-live';
  if (text.toLowerCase() === 'm') return 'preview-manager';
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
  colorCapability = detectHistoryColorMode(),
  notice = ''
} = {}) {
  if (!stdin?.isTTY || !stdout?.isTTY) {
    return { code: 0, saved: false, cancelled: false, skipped: true, config: currentConfig, error: null };
  }

  const activeController = controller ?? new OnboardingController({ currentConfig, previousConfig, filePath, save, applyArchiveEffects });
  if (notice) activeController.status = notice;
  const guard = new TerminalGuard({ stdin, stdout });
  const renderer = new AnsiDiffRenderer({ stdout, originRow: 1 });
  let previewKind = null;
  let done = false;
  let detachKeyInput = () => {};
  let finish;
  let fail;
  const finished = new Promise((resolve, reject) => { finish = resolve; fail = reject; });

  const draw = (force = false) => {
    const width = Math.max(44, stdout.columns || 100);
    const height = Math.max(16, stdout.rows || 30);
    const mode = paintMode(activeController.draftConfig?.theme, colorCapability);
    const frame = previewKind
      ? renderConfigPreview({ kind: previewKind, config: activeController.draftConfig, width, height, mode })
      : renderOnboarding({ controller: activeController, width, height, mode });
    if (force) renderer.reset([]);
    renderer.render(frame.lines);
    return frame;
  };

  const cleanup = () => {
    if (done) return;
    done = true;
    try { detachKeyInput(); } catch {}
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
    const action = actionForInput(data, { previewOpen: Boolean(previewKind) });
    if (!action) return;
    if (action === 'preview-close') {
      previewKind = null;
      draw(true);
      return;
    }
    if (action === 'preview-live' || action === 'preview-manager') {
      if (previewKind || activeController.step === ONBOARDING_STEP.SUMMARY) {
        previewKind = action === 'preview-live' ? 'live' : 'manager';
        draw(true);
      }
      return;
    }
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
      const result = activeController.activateCurrent(1);
      if (activeController.step === ONBOARDING_STEP.SUMMARY && result?.saved) {
        complete(result);
        return;
      }
      if (result?.saved) {
        complete(result);
        return;
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
    detachKeyInput = attachTerminalKeyInput(stdin, onInput);
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
