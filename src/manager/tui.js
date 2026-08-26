import { TerminalGuard } from '../terminal/guard.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';
import { detectHistoryColorMode } from '../history/theme.js';
import { SessionManagerCore } from './session-core.js';
import { SessionManagerTracker } from './tracker.js';
import { SessionManagerRuntime } from './runtime.js';
import { renderSessionDashboard } from './dashboard-render.js';
import { MANAGER_INSPECT_TABS, renderSessionInspect } from './inspect-render.js';
import { nextManagerScope, nextManagerSort, nextManagerView, normalizeManagerInput } from './input.js';
import { ManagerTelemetrySeries } from './telemetry-series.js';

function nextInspectTab(current, delta = 1) {
  const index = MANAGER_INSPECT_TABS.indexOf(current);
  const base = index < 0 ? 0 : index;
  return MANAGER_INSPECT_TABS[(base + delta + MANAGER_INSPECT_TABS.length) % MANAGER_INSPECT_TABS.length];
}

function managerPaintMode(theme, capability) {
  const normalized = String(theme ?? 'color').toLowerCase();
  if (normalized === 'mono' || capability === 'mono') return 'mono';
  if (normalized === 'matrix') return `matrix:${capability}`;
  return capability;
}

export async function runSessionManagerTui({
  platformAdapter,
  stdin = process.stdin,
  stdout = process.stdout,
  fsRef,
  now = () => Date.now(),
  processRef = process,
  colorCapability = detectHistoryColorMode(),
  theme = 'color',
  intervalMs = 250,
  telemetryIntervalMs = 1000,
  initialViewMode = 'operations'
} = {}) {
  if (!platformAdapter) throw new Error('Session Manager requires platform adapter');
  if (!stdin?.isTTY || !stdout?.isTTY) throw new Error('Session Manager TUI requires an interactive terminal');

  const colorMode = managerPaintMode(theme, colorCapability);
  const sessionsPath = platformAdapter.paths()?.sessions ?? null;
  const core = new SessionManagerCore({ sessionsPath, fsRef, now });
  const tracker = new SessionManagerTracker({ core, platformAdapter, now });
  const guard = new TerminalGuard({ stdin, stdout });
  const renderer = new AnsiDiffRenderer({ stdout, originRow: 1 });
  const telemetrySeries = new ManagerTelemetrySeries({ windowMs: 60_000, maxSamples: 60 });

  let rows = [];
  let scope = 'all';
  let search = '';
  let searchDraft = '';
  let searching = false;
  let sortBy = 'lastActivity';
  let direction = 'desc';
  let selectedId = null;
  let selectedIndex = 0;
  let viewMode = initialViewMode;
  let selectedDetail = null;
  let inspectTab = 'info';
  let done = false;
  let lastFrame = null;
  let telemetry = telemetrySeries.snapshot();
  let telemetryTimer = null;

  const draw = (force = false) => {
    if (done) return null;
    const width = Math.max(44, stdout.columns || 120);
    const height = Math.max(16, stdout.rows || 36);
    const frame = core.selectedId && selectedDetail
      ? renderSessionInspect({ detail: selectedDetail, width, height, mode: colorMode, activeTab: inspectTab })
      : renderSessionDashboard({
        rows,
        width,
        height,
        mode: colorMode,
        scope,
        search: searching ? searchDraft : search,
        sortBy,
        direction,
        selectedId,
        selectedIndex,
        viewMode,
        telemetry
      });

    if (!core.selectedId && frame.model) {
      selectedIndex = frame.model.selectedIndex < 0 ? 0 : frame.model.selectedIndex;
      selectedId = frame.model.selected?.id ?? null;
      lastFrame = frame;
    }
    if (force) renderer.reset([]);
    renderer.render(frame.lines);
    return frame;
  };

  const sampleTelemetry = () => {
    if (done || core.selectedId || searching) return;
    telemetry = telemetrySeries.sample(rows, { scope, search, atMs: now() });
    draw(false);
  };

  const runtime = new SessionManagerRuntime({
    tracker,
    intervalMs,
    onSnapshot(result) {
      rows = result.rows ?? [];
      selectedDetail = result.selectedDetail ?? selectedDetail;
      if (!telemetry.samples.length) telemetry = telemetrySeries.sample(rows, { scope, search, atMs: now() });
      draw(false);
    }
  });

  let finish;
  let fail;
  const finished = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });

  const cleanup = async () => {
    if (done) return;
    done = true;
    runtime.stop();
    if (telemetryTimer != null) {
      clearInterval(telemetryTimer);
      telemetryTimer = null;
    }
    try { stdin.off?.('data', onInput); } catch {}
    try { stdout.off?.('resize', onResize); } catch {}
    try { stdin.pause?.(); } catch {}
    guard.restore();
    await platformAdapter.cleanup?.();
  };

  const quit = async () => {
    await cleanup();
    finish(0);
  };

  const abort = async (error) => {
    if (done) return;
    await cleanup();
    fail(error);
  };

  const onResize = () => {
    try { draw(true); } catch (error) { void abort(error); }
  };

  const rebaselineTelemetry = () => {
    telemetrySeries.reset();
    telemetry = telemetrySeries.sample(rows, { scope, search, atMs: now() });
  };

  const handleInput = async (data) => {
    if (done) return;
    const normalized = normalizeManagerInput(data, { searching });
    if (normalized == null) return;
    const action = typeof normalized === 'object' ? normalized.action : normalized;
    if (!action) return;

    if (core.selectedId) {
      if (action === 'quit') {
        core.releaseSelection();
        selectedDetail = null;
        inspectTab = 'info';
        rebaselineTelemetry();
        draw(true);
      } else if (action === 'tab' || action === 'right') {
        inspectTab = nextInspectTab(inspectTab, 1);
        draw(false);
      } else if (action === 'left') {
        inspectTab = nextInspectTab(inspectTab, -1);
        draw(false);
      }
      return;
    }

    if (searching) {
      if (action === 'search-cancel') {
        searching = false;
        searchDraft = search;
      } else if (action === 'search-accept') {
        searching = false;
        search = searchDraft.trim();
        selectedId = null;
        selectedIndex = 0;
        rebaselineTelemetry();
      } else if (action === 'search-backspace') {
        searchDraft = [...searchDraft].slice(0, -1).join('');
      } else if (action === 'search-text') {
        searchDraft += normalized.text;
      }
      draw(false);
      return;
    }

    if (action === 'quit') {
      await quit();
      return;
    }

    let forceDraw = false;
    if (action === 'search') {
      searching = true;
      searchDraft = search;
    } else if (action === 'filter') {
      scope = nextManagerScope(scope);
      selectedId = null;
      selectedIndex = 0;
      rebaselineTelemetry();
    } else if (action === 'sort') {
      sortBy = nextManagerSort(sortBy);
      selectedId = null;
      selectedIndex = 0;
    } else if (action === 'direction') {
      direction = direction === 'desc' ? 'asc' : 'desc';
    } else if (action === 'view') {
      viewMode = nextManagerView(viewMode);
    } else if (action === 'up' && lastFrame?.model?.rows?.length) {
      selectedIndex = Math.max(0, selectedIndex - 1);
      selectedId = lastFrame.model.rows[selectedIndex]?.id ?? selectedId;
    } else if (action === 'down' && lastFrame?.model?.rows?.length) {
      selectedIndex = Math.min(lastFrame.model.rows.length - 1, selectedIndex + 1);
      selectedId = lastFrame.model.rows[selectedIndex]?.id ?? selectedId;
    } else if (action === 'inspect') {
      const selected = lastFrame?.model?.selected;
      if (selected) {
        core.select(selected.id);
        selectedDetail = core.selectedDetail();
        inspectTab = 'info';
        forceDraw = true;
      }
    }
    draw(forceDraw);
  };

  const onInput = (data) => {
    void handleInput(data).catch((error) => { void abort(error); });
  };

  const onSignal = () => { void quit(); };
  processRef?.once?.('SIGINT', onSignal);
  processRef?.once?.('SIGTERM', onSignal);

  try {
    guard.enterAlternateScreen();
    guard.hideCursor();
    guard.enableMouse();
    guard.enterRawMode();
    stdin.resume?.();
    stdin.on?.('data', onInput);
    stdout.on?.('resize', onResize);
    stdout.write('\x1b[2J\x1b[H');
    telemetryTimer = setInterval(sampleTelemetry, Math.max(250, Number(telemetryIntervalMs) || 1000));
    telemetryTimer.unref?.();
    void runtime.start().catch((error) => { void abort(error); });
    const code = await finished;
    return { code, core, tracker, runtime, viewMode, theme, colorMode, telemetry };
  } finally {
    processRef?.removeListener?.('SIGINT', onSignal);
    processRef?.removeListener?.('SIGTERM', onSignal);
    if (!done) await cleanup();
  }
}
