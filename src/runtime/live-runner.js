import { TerminalGuard } from '../terminal/guard.js';
import { installProcessSafety } from '../terminal/process-safety.js';
import { childEnvironmentForAuth, codexArgsForAuth } from '../core/auth.js';
import { applyNormalizedEvent } from '../core/reducer.js';
import { PROVENANCE } from '../core/provenance.js';
import { setMetric } from '../core/normalized-state.js';
import { parsePtyTransient } from '../parsers/pty-transient.js';
import { spawnCodexPty } from '../platform/pty.js';
import { LivePaneController } from './live-pane.js';
import { LiveDataRuntime } from './live-data.js';

const SIGNAL_EXIT_CODE = Object.freeze({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 });
const MONITOR_HOTKEYS = Object.freeze([
  { sequence: '\x1bOS', action: 'history' },
  { sequence: '\x1b[14~', action: 'history' },
  { sequence: '\x1b[1;3D', action: 'previous-view' },
  { sequence: '\x1b[1;9D', action: 'previous-view' },
  { sequence: '\x1b[1;3C', action: 'next-view' },
  { sequence: '\x1b[1;9C', action: 'next-view' }
]);

export function splitMonitorHotkeys(input) {
  let remaining = String(input ?? '');
  const actions = [];
  for (const hotkey of MONITOR_HOTKEYS) {
    let index = remaining.indexOf(hotkey.sequence);
    while (index !== -1) {
      actions.push({ action: hotkey.action, index });
      remaining = `${remaining.slice(0, index)}${remaining.slice(index + hotkey.sequence.length)}`;
      index = remaining.indexOf(hotkey.sequence);
    }
  }
  actions.sort((a, b) => a.index - b.index);
  return { actions: actions.map((entry) => entry.action), forwarded: remaining };
}

export async function runCodexLive({
  codexPath,
  codexArgs = [],
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
  const dataRuntime = monitorState && monitorConfig && platformAdapter
    ? new LiveDataRuntime({
      state: monitorState,
      config: monitorConfig,
      adapter: platformAdapter,
      cwd,
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
  let disposeSafety = () => {};

  const cleanup = () => {
    if (faultTimer) clearTimeout(faultTimer);
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

  const requestHistory = async () => {
    if (!platformAdapter?.openHistoryTerminal) return false;
    try {
      const result = await platformAdapter.openHistoryTerminal({ command: 'codexm', args: ['--history'], cwd });
      if (result?.ok) return true;
    } catch {}
    try { stderr.write('\nCould not open a new terminal.\nRun: codexm --history\n'); } catch {}
    return false;
  };

  const shiftView = (delta) => {
    if (!pane) return false;
    const before = pane.activeTab;
    const next = pane.shiftTab(delta);
    if (next === before) return false;
    dataRuntime?.setActiveTab?.(next);
    return true;
  };

  const onInput = (data) => {
    if (!child || exiting) return;
    const parsed = splitMonitorHotkeys(data.toString('utf8'));
    for (const action of parsed.actions) {
      if (action === 'history') void requestHistory();
      else if (action === 'previous-view') shiftView(-1);
      else if (action === 'next-view') shiftView(1);
    }
    if (parsed.forwarded) {
      try { child.write(parsed.forwarded); } catch {}
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
        for (const event of parsePtyTransient(data, Date.now())) {
          applyNormalizedEvent(monitorState, event, { source: PROVENANCE.LOCAL });
        }
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
