import { StringDecoder } from 'node:string_decoder';
import { TerminalGuard } from '../terminal/guard.js';
import { installProcessSafety } from '../terminal/process-safety.js';
import { childEnvironmentForAuth, codexArgsForAuth } from '../core/auth.js';
import { applyNormalizedEvent } from '../core/reducer.js';
import { PROVENANCE } from '../core/provenance.js';
import { setMetric } from '../core/normalized-state.js';
import { PtyTransientStreamParser } from '../parsers/pty-transient.js';
import { spawnCodexPty } from '../platform/pty.js';
import { LivePaneController } from './live-pane.js';
import { LiveDataRuntime } from './live-data.js';

const SIGNAL_EXIT_CODE = Object.freeze({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 });
const HUD_REPAIR_INTERVAL_MS = 16;
export function childOutputMayClobberHud(input) {
  const text = String(input ?? '');
  return /\x1b\[[0-3]?J/.test(text)
    || /\x1b\[[0-9;]*r/.test(text)
    || /\x1b\[\?(?:47|1047|1049)[hl]/.test(text)
    || text.includes('\x1bc');
}

export async function runCodexLive({
  codexPath,
  codexArgs = [],
  resumeTargetPath = null,
  auth,
  monitorState = null,
  monitorConfig = null,
  platformAdapter = null,
  cwd = process.cwd(),
  env = process.env,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  processRef = process,
  spawnPty = null,
  faultAfterStartMs = null,
  hudRepairIntervalMs = HUD_REPAIR_INTERVAL_MS
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
  const dataRuntime = monitorState && monitorConfig && platformAdapter
    ? new LiveDataRuntime({
      state: monitorState,
      config: monitorConfig,
      adapter: platformAdapter,
      cwd,
      codexArgs,
      resumeTargetPath,
      processRef,
      onUpdate() { pane?.invalidate?.(); }
    })
    : null;
  const initialGeometry = pane?.geometry?.() ?? null;
  const cols = Math.max(20, stdout.columns || 80);
  const rows = initialGeometry?.childRows ?? Math.max(8, stdout.rows || 24);
  const spawnFn = spawnPty
    ?? (platformAdapter?.spawnPty ? (options) => platformAdapter.spawnPty(options) : spawnCodexPty);

  let child = null;
  let exiting = false;
  let exitCode = 0;
  let faultTimer = null;
  let hudRepairTimer = null;
  let disposeSafety = () => {};
  const inputDecoder = new StringDecoder('utf8');
  const ptyTransient = new PtyTransientStreamParser();

  const clearHudRepairTimer = () => {
    if (!hudRepairTimer) return;
    clearTimeout(hudRepairTimer);
    hudRepairTimer = null;
  };

  const repairHud = () => {
    hudRepairTimer = null;
    if (!pane || exiting) return;
    const geometry = pane.geometry();
    guard.setScrollRegion(1, geometry.childRows);
    pane.render({ force: true });
  };

  const scheduleHudRepair = () => {
    if (!pane || exiting || hudRepairTimer) return;
    hudRepairTimer = setTimeout(repairHud, Math.max(0, hudRepairIntervalMs));
  };

  const cleanup = () => {
    if (faultTimer) clearTimeout(faultTimer);
    clearHudRepairTimer();
    try { stdout.off?.('resize', onResize); } catch {}
    try { stdin.off?.('data', onInput); } catch {}
    try { stdin.pause?.(); } catch {}
    dataRuntime?.stop?.();
    pane?.dispose?.();
    guard.restore();
    disposeSafety();
    try { void platformAdapter?.cleanup?.(); } catch {}
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
    if (pane) guard.setScrollRegion(1, nextRows);
    try { child.resize(nextCols, nextRows); } catch {}
  };

  const onResize = () => {
    if (!child || exiting) return;
    if (pane) pane.onResize((geometry) => resizeChild(geometry));
    else resizeChild();
  };

  const writeChildInput = (value) => {
    if (!child || exiting || !value) return;
    try { child.write(value); } catch {}
  };

  const onInput = (data) => {
    if (!child || exiting) return;
    const value = Buffer.isBuffer(data) || ArrayBuffer.isView(data)
      ? inputDecoder.write(data)
      : String(data ?? '');
    writeChildInput(value);
    if (pane && monitorState) {
      const events = ptyTransient.observeInput(value, Date.now());
      if (events.length > 0) {
        for (const event of events) applyNormalizedEvent(monitorState, event, { source: PROVENANCE.LOCAL });
        pane.invalidate();
      }
    }
  };

  try {
    child = await spawnFn({
      codexPath,
      args: childArgs,
      cols,
      rows,
      cwd,
      env: childEnv
    });

    if (monitorState && Number.isFinite(child?.pid)) {
      setMetric(monitorState.processes, 'rootPid', child.pid, { source: PROVENANCE.LOCAL, observedAtMs: Date.now(), evidence: 'pty-child-pid' });
    }
    dataRuntime?.start?.();
    if (pane) guard.setScrollRegion(1, rows);
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
        const events = ptyTransient.push(data, Date.now());
        if (events.length > 0) {
          for (const event of events) {
            applyNormalizedEvent(monitorState, event, { source: PROVENANCE.LOCAL });
          }
          pane.invalidate();
        }

        if (childOutputMayClobberHud(data)) scheduleHudRepair();
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
