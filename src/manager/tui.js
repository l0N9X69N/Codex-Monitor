import { TerminalGuard } from '../terminal/guard.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';
import { detectHistoryColorMode } from '../history/theme.js';
import { SessionManagerCore } from './session-core.js';
import { SessionManagerTracker } from './tracker.js';
import { SessionManagerRuntime } from './runtime.js';
import { renderSessionDashboard } from './dashboard-render.js';
import { nextManagerScope, nextManagerSort, normalizeManagerInput } from './input.js';

const FOCUS_ORDER = Object.freeze(['table', 'tokens', 'context', 'tools']);

function nextFocus(current, delta = 1) {
  const index = FOCUS_ORDER.indexOf(current);
  const base = index < 0 ? 0 : index;
  return FOCUS_ORDER[(base + delta + FOCUS_ORDER.length) % FOCUS_ORDER.length];
}

export async function runSessionManagerTui({
  platformAdapter,
  stdin = process.stdin,
  stdout = process.stdout,
  fsRef,
  now = () => Date.now(),
  processRef = process,
  colorMode = detectHistoryColorMode(),
  intervalMs = 250
} = {}) {
  if (!platformAdapter) throw new Error('Session Manager requires platform adapter');
  if (!stdin?.isTTY || !stdout?.isTTY) throw new Error('Session Manager TUI requires an interactive terminal');

  const sessionsPath = platformAdapter.paths()?.sessions ?? null;
  const core = new SessionManagerCore({ sessionsPath, fsRef, now });
  const tracker = new SessionManagerTracker({ core, platformAdapter, now });
  const guard = new TerminalGuard({ stdin, stdout });
  const renderer = new AnsiDiffRenderer({ stdout, originRow: 1 });

  let rows = [];
  let scope = 'all';
  let search = '';
  let searchDraft = '';
  let searching = false;
  let sortBy = 'lastActivity';
  let direction = 'desc';
  let selectedId = null;
  let selectedIndex = 0;
  let focus = 'table';
  let done = false;
  let lastFrame = null;

  const draw = (force = false) => {
    if (done) return null;
    const frame = renderSessionDashboard({
      rows,
      width: Math.max(44, stdout.columns || 120),
      height: Math.max(16, stdout.rows || 36),
      mode: colorMode,
      scope,
      search: searching ? searchDraft : search,
      sortBy,
      direction,
      selectedId,
      selectedIndex,
      focus
    });
    selectedIndex = frame.model.selectedIndex < 0 ? 0 : frame.model.selectedIndex;
    selectedId = frame.model.selected?.id ?? null;
    lastFrame = frame;
    if (force) renderer.reset([]);
    renderer.render(frame.lines);
    return frame;
  };

  const runtime = new SessionManagerRuntime({
    tracker,
    intervalMs,
    onSnapshot(result) {
      rows = result.rows ?? [];
      draw(false);
    }
  });

  const cleanup = async () => {
    if (done) return;
    done = true;
    runtime.stop();
    try { stdin.off?.('data', onInput); } catch {}
    try { stdout.off?.('resize', onResize); } catch {}
    try { stdin.pause?.(); } catch {}
    guard.restore();
    await platformAdapter.cleanup?.();
  };

  let finish;
  const finished = new Promise((resolve) => { finish = resolve; });

  const quit = async () => {
    await cleanup();
    finish(0);
  };

  const onResize = () => draw(true);

  const onInput = async (data) => {
    if (done) return;
    const normalized = normalizeManagerInput(data, { searching });
    const action = typeof normalized === 'object' ? normalized.action : normalized;
    if (!action) return;

    if (searching) {
      if (action === 'search-cancel') {
        searching = false;
        searchDraft = search;
      } else if (action === 'search-accept') {
        searching = false;
        search = searchDraft.trim();
        selectedId = null;
        selectedIndex = 0;
      } else if (action === 'search-backspace') {
        searchDraft = [...searchDraft].slice(0, -1).join('');
      } else if (action === 'search-text') {
        searchDraft += normalized.text;
      }
      draw(false);
      return;
    }

    if (action === 'quit') {
      if (core.selectedId) {
        core.releaseSelection();
        draw(false);
      } else {
        await quit();
      }
      return;
    }

    if (action === 'search') {
      searching = true;
      searchDraft = search;
    } else if (action === 'filter') {
      scope = nextManagerScope(scope);
      selectedId = null;
      selectedIndex = 0;
    } else if (action === 'sort') {
      sortBy = nextManagerSort(sortBy);
      selectedId = null;
      selectedIndex = 0;
    } else if (action === 'direction') {
      direction = direction === 'desc' ? 'asc' : 'desc';
    } else if (action === 'up' && lastFrame?.model?.rows?.length) {
      selectedIndex = Math.max(0, selectedIndex - 1);
      selectedId = lastFrame.model.rows[selectedIndex]?.id ?? selectedId;
    } else if (action === 'down' && lastFrame?.model?.rows?.length) {
      selectedIndex = Math.min(lastFrame.model.rows.length - 1, selectedIndex + 1);
      selectedId = lastFrame.model.rows[selectedIndex]?.id ?? selectedId;
    } else if (action === 'tab' || action === 'right') {
      focus = nextFocus(focus, 1);
    } else if (action === 'left') {
      focus = nextFocus(focus, -1);
    } else if (action === 'inspect') {
      const selected = lastFrame?.model?.selected;
      if (selected) core.select(selected.id);
    }
    draw(false);
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
    void runtime.start().catch(async (error) => {
      if (!done) {
        await cleanup();
        finish(Promise.reject(error));
      }
    });
    const code = await finished;
    return { code, core, tracker, runtime };
  } finally {
    processRef?.removeListener?.('SIGINT', onSignal);
    processRef?.removeListener?.('SIGTERM', onSignal);
    if (!done) await cleanup();
  }
}

export { FOCUS_ORDER as MANAGER_FOCUS_ORDER };
