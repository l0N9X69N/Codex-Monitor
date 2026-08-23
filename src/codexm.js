#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import ptyPkg from '@homebridge/node-pty-prebuilt-multiarch';
import { QuotaTracker, getSessionsRoot } from './quota.js';
import { monitorRowsForCols, renderMonitor, truncateAnsi } from './render.js';
import { PtyTransientTracker } from './transient.js';

const VERSION = '0.3.7';
const ESC = '\x1b';
const WRAPPER_STARTED_AT = Date.now();

function fail(message, code = 1) {
  process.stderr.write(`codexm: ${message}\n`);
  process.exit(code);
}

function writeRaw(s) {
  try { process.stdout.write(s); } catch {}
}

function resolveCodexOnWindows() {
  try {
    const output = execFileSync('where.exe', ['codex'], { encoding: 'utf8', windowsHide: true });
    const paths = output.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const selfShim = path.resolve(process.argv[1] ?? '').toLowerCase();
    const candidates = paths.filter((p) => path.resolve(p).toLowerCase() !== selfShim);
    return candidates.find((p) => /\.exe$/i.test(p))
      ?? candidates.find((p) => /\.(cmd|bat)$/i.test(p))
      ?? candidates[0]
      ?? null;
  } catch { return null; }
}

function resolveCodex() {
  if (process.env.CODEXM_CODEX) return process.env.CODEXM_CODEX;
  if (process.platform === 'win32') return resolveCodexOnWindows();
  try { return execFileSync('sh', ['-lc', 'command -v codex'], { encoding: 'utf8' }).trim() || null; }
  catch { return null; }
}

function quoteCmdArg(value) {
  if (value === '') return '""';
  let s = String(value).replace(/%/g, '%%');
  s = s.replace(/([&|<>^])/g, '^$1');
  if (!/[\s"&|<>^()]/.test(s)) return s;
  s = s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1');
  return `"${s}"`;
}

function spawnCodex(codexPath, args, cols, rows) {
  const options = {
    name: process.env.TERM || 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: { ...process.env, TERM: process.env.TERM || 'xterm-256color' }
  };
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(codexPath)) {
    const comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const command = [quoteCmdArg(codexPath), ...args.map(quoteCmdArg)].join(' ');
    return ptyPkg.spawn(comspec, ['/d', '/s', '/c', command], options);
  }
  return ptyPkg.spawn(codexPath, args, options);
}

function readGitState() {
  let branch = null;
  let dirtyCount = 0;
  try {
    const value = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: process.cwd(), encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    branch = value && value !== 'HEAD' ? value : null;
  } catch {}
  try {
    const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=normal'], {
      cwd: process.cwd(), encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
    });
    dirtyCount = status.split(/\r?\n/).filter((line) => line.trim()).length;
  } catch {}
  return { branch, dirtyCount };
}

const initialGit = readGitState();
const runtime = {
  startedAtMs: WRAPPER_STARTED_AT,
  project: path.basename(process.cwd()),
  branch: initialGit.branch,
  dirtyCount: initialGit.dirtyCount,
  observedModel: null,
  observedReasoning: null
};

const CHILD_ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

function observeChildOutput(data) {
  const text = String(data).replace(CHILD_ANSI_RE, ' ').replace(/[\r\n]+/g, ' ');
  const changed = text.match(/Model\s+changed\s+to\s+([^\s]+)\s+([A-Za-z0-9_-]+)/i);
  const card = text.match(/model:\s*([^\s]+)\s+([A-Za-z0-9_-]+)/i);
  const match = changed || card;
  if (!match) return;
  runtime.observedModel = match[1];
  runtime.observedReasoning = match[2];
}

function terminalSize() {
  const cols = Math.max(20, process.stdout.columns || 80);
  const totalRows = Math.max(10, process.stdout.rows || 30);
  const monitorRows = monitorRowsForCols(cols);
  return { cols, totalRows, monitorRows, childRows: Math.max(5, totalRows - monitorRows) };
}

function doctor() {
  const codex = resolveCodex();
  const sessions = getSessionsRoot();
  const tracker = new QuotaTracker({ sessionsRoot: sessions });
  const state = tracker.refresh(true);
  const lines = [
    `Codex Monitor Wrapper ${VERSION}`,
    `Node: ${process.version} (${process.platform}/${process.arch})`,
    `Codex: ${codex ?? 'NOT FOUND'}`,
    `Sessions: ${sessions}${fs.existsSync(sessions) ? '' : ' (not found yet)'}`,
    `Active rollout: ${state?.filePath ?? 'not found yet'}`,
    `5h quota: ${state?.fiveHour ? `${Math.round(state.fiveHour.remainingPercent)}% left` : 'not found yet'}`,
    `Week quota: ${state?.weekly ? `${Math.round(state.weekly.remainingPercent)}% left` : 'not found yet'}`,
    `Token usage: ${state?.usage?.total ? 'found' : 'not found yet'}`,
    `Activity: ${state?.meta?.activityState ?? 'IDLE'}`,
    `Compactions/retries/errors: ${state?.meta?.compactCount ?? 0}/${state?.meta?.retryCount ?? 0}/${state?.meta?.errorCount ?? 0}`,
    `PTY module: loaded`
  ];
  process.stdout.write(lines.join(os.EOL) + os.EOL);
  process.exit(codex ? 0 : 2);
}

const DEMO_STATES = ['IDLE', 'THINKING', 'TOOL', 'APPROVAL', 'ERROR'];

function demoState(activityState, nowMs = Date.now()) {
  const weekResetSeconds = Math.floor(nowMs / 1000) + 6 * 86400 + 6 * 3600;
  return {
    filePath: null,
    fiveHour: null,
    weekly: {
      remainingPercent: 82,
      usedPercent: 18,
      resetsAt: weekResetSeconds,
      windowMinutes: 10080
    },
    usage: {
      total: {
        inputTokens: 567000,
        cachedInputTokens: 505000,
        cacheWriteInputTokens: 0,
        outputTokens: 6400,
        reasoningOutputTokens: 3900,
        totalTokens: 577300
      },
      last: {
        inputTokens: 49500,
        cachedInputTokens: 43800,
        cacheWriteInputTokens: 0,
        outputTokens: 5,
        reasoningOutputTokens: 0,
        totalTokens: 49505
      },
      contextWindow: 258000
    },
    meta: {
      model: 'gpt-5.4-mini',
      reasoningEffort: 'medium',
      cwd: process.cwd(),
      cliVersion: 'demo',
      currentSession: true,
      activityState,
      activityAtMs: nowMs,
      turnCount: 6,
      lastTurnDurationMs: 16000,
      lastEventAtMs: nowMs,
      compactCount: 0,
      retryCount: activityState === 'ERROR' ? 1 : 0,
      errorCount: activityState === 'ERROR' ? 1 : 0
    }
  };
}

function demoRequestedState(args) {
  const index = args.indexOf('--demo-state');
  if (index < 0) return null;
  const value = String(args[index + 1] ?? '').toUpperCase();
  if (!DEMO_STATES.includes(value)) {
    fail(`--demo-state expects one of: ${DEMO_STATES.join(', ')}`);
  }
  return value;
}

function runDemo(fixedState = null) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail('demo mode requires an interactive terminal.');
  }

  const startedAtMs = Date.now();
  const demoRuntime = {
    startedAtMs,
    project: path.basename(process.cwd()),
    branch: 'demo/state-preview',
    dirtyCount: 2,
    observedModel: 'gpt-5.4-mini',
    observedReasoning: 'medium'
  };

  let stateIndex = Math.max(0, fixedState ? DEMO_STATES.indexOf(fixedState) : 0);
  let timer = null;
  let stopped = false;

  const render = () => {
    if (stopped) return;
    const nowMs = Date.now();
    const activityState = fixedState ?? DEMO_STATES[stateIndex];
    const state = demoState(activityState, nowMs);
    const cols = Math.max(72, process.stdout.columns || 120);
    const rows = Math.max(10, process.stdout.rows || 30);
    const lines = renderMonitor(state, cols, nowMs, demoRuntime);
    const top = Math.max(3, rows - lines.length + 1);

    let out = `${ESC}7`;
    out += `${ESC}[1;1H${ESC}[2K`;
    out += `Codex Monitor demo · ${activityState} · ${fixedState ? 'fixed' : 'auto-cycle every 2s'} · Ctrl+C to exit`;
    for (let i = 0; i < lines.length; i += 1) {
      out += `${ESC}[${top + i};1H${ESC}[2K${truncateAnsi(lines[i], cols)}`;
    }
    out += `${ESC}8`;
    writeRaw(out);
  };

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    process.stdout.off('resize', render);
    try {
      const rows = Math.max(10, process.stdout.rows || 30);
      const cols = Math.max(72, process.stdout.columns || 120);
      const count = monitorRowsForCols(cols);
      let out = `${ESC}7${ESC}[1;1H${ESC}[2K`;
      for (let i = 0; i < count; i += 1) {
        const row = Math.max(1, rows - count + 1 + i);
        out += `${ESC}[${row};1H${ESC}[2K`;
      }
      out += `${ESC}8`;
      writeRaw(out);
    } catch {}
  };

  process.stdout.on('resize', render);
  process.on('SIGINT', () => {
    cleanup();
    process.stdout.write(os.EOL);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  render();

  if (!fixedState) {
    timer = setInterval(() => {
      stateIndex = (stateIndex + 1) % DEMO_STATES.length;
      render();
    }, 2000);
  }

  // Keep the process alive for fixed-state previews too.
  process.stdin.resume();
}

const argv = process.argv.slice(2);
if (argv.includes('--codexm-version')) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}
if (argv.includes('--doctor')) doctor();

const fixedDemoState = demoRequestedState(argv);
if (argv.includes('--demo') || fixedDemoState) {
  runDemo(fixedDemoState);
} else if (!process.stdin.isTTY || !process.stdout.isTTY) {
  fail('interactive terminal required. Use official `codex` for redirected/piped I/O.');
}

if (argv.includes('--demo') || fixedDemoState) {
  // runDemo() owns the process from here; never forward demo flags to Codex.
} else {
const codexPath = resolveCodex();
if (!codexPath) fail('official Codex CLI was not found on PATH. Install/update @openai/codex first.');

const tracker = new QuotaTracker({
  activeSinceMs: WRAPPER_STARTED_AT,
  cwd: process.cwd(),
  rescanMs: 400,
  refreshMs: 100
});
tracker.refresh(true);
const transient = new PtyTransientTracker();
let { cols, totalRows, monitorRows, childRows } = terminalSize();
let child;
let renderTimer;
let gitTimer;
let renderPending = false;
let exiting = false;
const stdinWasRaw = Boolean(process.stdin.isRaw);

// Keep Codex scrolling inside the rows above the monitor. Without a DECSTBM
// scroll region, a long response can make the host terminal scroll all rows,
// after which the monitor repaint may overwrite the last visible Codex lines.
function childScrollRegionSequence() {
  const bottom = Math.max(1, Math.min(totalRows, childRows));
  return `${ESC}[1;${bottom}r`;
}

function resetScrollRegionSequence() {
  return `${ESC}[r`;
}

function applyChildScrollRegion() {
  // DECSTBM moves the cursor on many terminals, so preserve/restore it.
  writeRaw(`${ESC}7${childScrollRegionSequence()}${ESC}8`);
}

function drawMonitor() {
  if (exiting) return;
  const nowMs = Date.now();
  const state = transient.overlayState(tracker.refresh(), nowMs);
  const lines = renderMonitor(state, cols, nowMs, runtime);
  // Re-assert the child scroll region on every HUD repaint. This also heals
  // terminals that reset margins after alternate-screen or full-screen ops.
  let out = `${ESC}7${childScrollRegionSequence()}`;
  for (let i = 0; i < monitorRows; i += 1) {
    const row = totalRows - monitorRows + 1 + i;
    out += `${ESC}[${row};1H${ESC}[2K${truncateAnsi(lines[i] ?? '', cols)}`;
  }
  out += `${ESC}8`;
  writeRaw(out);
}

function scheduleDraw() {
  if (renderPending || exiting) return;
  renderPending = true;
  setTimeout(() => {
    renderPending = false;
    drawMonitor();
  }, 16);
}

function clearMonitor(rows = monitorRows) {
  let out = `${ESC}7${childScrollRegionSequence()}`;
  for (let i = 0; i < rows; i += 1) {
    const row = totalRows - rows + 1 + i;
    out += `${ESC}[${row};1H${ESC}[2K`;
  }
  out += `${ESC}8`;
  writeRaw(out);
}

function restoreTerminal() {
  if (renderTimer) clearInterval(renderTimer);
  if (gitTimer) clearInterval(gitTimer);
  process.stdout.off('resize', onResize);
  try { clearMonitor(); } catch {}
  // Restore the terminal's normal full-height scrolling before returning to
  // the shell. Keep this separate from clearMonitor(), which intentionally
  // preserves the child-only region while Codex is alive.
  try { writeRaw(`${ESC}7${resetScrollRegionSequence()}${ESC}8`); } catch {}
  try { if (process.stdin.setRawMode) process.stdin.setRawMode(stdinWasRaw); } catch {}
  try { process.stdin.pause(); } catch {}
}

function onResize() {
  const oldRows = monitorRows;
  const next = terminalSize();
  if (oldRows !== next.monitorRows) {
    try { clearMonitor(oldRows); } catch {}
  }
  cols = next.cols;
  totalRows = next.totalRows;
  monitorRows = next.monitorRows;
  childRows = next.childRows;
  try { child.resize(cols, childRows); } catch {}
  applyChildScrollRegion();
  scheduleDraw();
}

try { child = spawnCodex(codexPath, argv, cols, childRows); }
catch (error) { fail(`failed to launch Codex: ${error?.message ?? error}`); }

// Establish the reserved monitor area before Codex begins producing enough
// output to scroll the host terminal.
applyChildScrollRegion();

try { process.stdin.setRawMode?.(true); } catch {}
process.stdin.resume();
process.stdin.on('data', (data) => {
  if (exiting) return;
  if (transient.feedInput(data)) scheduleDraw();
  try { child.write(data.toString('utf8')); } catch {}
});

child.onData((data) => {
  observeChildOutput(data);
  transient.feedOutput(data);
  writeRaw(data);
  scheduleDraw();
});

child.onExit(({ exitCode }) => {
  if (exiting) return;
  exiting = true;
  restoreTerminal();
  process.exit(typeof exitCode === 'number' ? exitCode : 0);
});

process.stdout.on('resize', onResize);
// Keep the dashboard visually live. File reads are stat-gated in QuotaTracker,
// so this 250 ms repaint does not re-read the rollout unless it actually changed.
renderTimer = setInterval(drawMonitor, 250);
gitTimer = setInterval(() => {
  const git = readGitState();
  runtime.branch = git.branch;
  runtime.dirtyCount = git.dirtyCount;
}, 3000);
drawMonitor();

for (const signal of ['SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (exiting) return;
    exiting = true;
    try { child.kill(); } catch {}
    restoreTerminal();
    process.exit(0);
  });
}

process.on('uncaughtException', (error) => {
  exiting = true;
  restoreTerminal();
  process.stderr.write(`\ncodexm error: ${error?.stack ?? error}\n`);
  process.exit(1);
});
}
