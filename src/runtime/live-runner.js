import { TerminalGuard } from '../terminal/guard.js';
import { installProcessSafety } from '../terminal/process-safety.js';
import { childEnvironmentForAuth, codexArgsForAuth } from '../core/auth.js';
import { applyNormalizedEvent } from '../core/reducer.js';
import { PROVENANCE } from '../core/provenance.js';
import { parsePtyTransient } from '../parsers/pty-transient.js';
import { spawnCodexPty } from '../platform/pty.js';
import { LivePaneController } from './live-pane.js';

const SIGNAL_EXIT_CODE = Object.freeze({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 });

export async function runCodexLive({
  codexPath,
  codexArgs = [],
  auth,
  monitorState = null,
  monitorConfig = null,
  cwd = process.cwd(),
  env = process.env,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  processRef = process,
  spawnPty = spawnCodexPty,
  faultAfterStartMs = null
} = {}) {
  if (!stdin?.isTTY || !stdout?.isTTY) {
    throw new Error('interactive terminal required; use official `codex` for redirected/piped I/O');
  }

  const guard = new TerminalGuard({ stdin, stdout });
  const childEnv = childEnvironmentForAuth(auth, env);
  const childArgs = codexArgsForAuth(auth, codexArgs);
  const pane = monitorState && monitorConfig
    ? new LivePaneController({ stdout, state: monitorState, config: monitorConfig, cwd })
    : null;
  const initialGeometry = pane?.geometry?.() ?? null;
  const cols = Math.max(20, stdout.columns || 80);
  const rows = initialGeometry?.childRows ?? Math.max(8, stdout.rows || 24);

  let child = null;
  let exiting = false;
  let exitCode = 0;
  let faultTimer = null;
  let disposeSafety = () => {};

  const cleanup = () => {
    if (faultTimer) clearTimeout(faultTimer);
    try { stdout.off?.('resize', onResize); } catch {}
    try { stdin.off?.('data', onInput); } catch {}
    try { stdin.pause?.(); } catch {}
    pane?.dispose?.();
    guard.restore();
    disposeSafety();
  };

  const finish = (code) => {
    if (exiting) return;
    exiting = true;
    exitCode = Number.isFinite(code) ? code : 0;
    cleanup();
  };

  const resizeChild = (geometry = null) => {
    if (!child || exiting) return;
    const nextCols = Math.max(20, stdout.columns || 80);
    const nextRows = geometry?.childRows ?? Math.max(8, stdout.rows || 24);
    try { child.resize(nextCols, nextRows); } catch {}
  };

  const onResize = () => {
    if (!child || exiting) return;
    if (pane) pane.onResize((geometry) => resizeChild(geometry));
    else resizeChild();
  };

  const onInput = (data) => {
    if (!child || exiting) return;
    try { child.write(data.toString('utf8')); } catch {}
  };

  try {
    child = await spawnPty({
      codexPath,
      args: childArgs,
      cols,
      rows,
      cwd,
      env: childEnv
    });

    guard.enterRawMode();
    stdin.resume?.();
    stdin.on?.('data', onInput);
    stdout.on?.('resize', onResize);
    pane?.render?.({ force: true });
  } catch (error) {
    cleanup();
    throw error;
  }

  return await new Promise((resolve, reject) => {
    const finishAndResolve = (code) => {
      finish(code);
      resolve(exitCode);
    };

    disposeSafety = installProcessSafety({
      guard,
      processRef,
      onSignal(signal) {
        if (exiting) return;
        try { child?.kill?.(); } catch {}
        finishAndResolve(SIGNAL_EXIT_CODE[signal] ?? 1);
      },
      onFatal(error, kind) {
        if (exiting) return;
        try { child?.kill?.(); } catch {}
        try { stderr.write(`\ncodexm ${kind}: ${error?.stack ?? error}\n`); } catch {}
        finish(1);
        reject(error);
      }
    });

    child.onData((data) => {
      if (exiting) return;
      try { stdout.write(data); } catch {}
      if (pane && monitorState) {
        for (const event of parsePtyTransient(data, Date.now())) {
          applyNormalizedEvent(monitorState, event, { source: PROVENANCE.LOCAL });
        }
        // Codex may clear/repaint its viewport, so redraw the reserved HUD after
        // PTY output. The controller coalesces bursts instead of running a FPS loop.
        pane.invalidate({ force: true });
      }
    });

    child.onExit(({ exitCode: childExitCode }) => {
      if (exiting) return;
      finishAndResolve(Number.isFinite(childExitCode) ? childExitCode : 0);
    });

    if (Number.isFinite(faultAfterStartMs) && faultAfterStartMs >= 0) {
      faultTimer = setTimeout(() => {
        processRef.emit('uncaughtException', new Error('Phase 01 injected failure after PTY start'));
      }, faultAfterStartMs);
    }
  });
}
