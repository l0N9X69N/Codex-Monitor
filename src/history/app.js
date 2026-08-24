import { TerminalGuard } from '../terminal/guard.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';
import { detectHistoryColorMode } from './theme.js';
import { renderHistoryFrame, DETAIL_TABS } from './render.js';
import { normalizeHistoryInput } from './input.js';

export async function runHistoryTui({
  engine,
  stdin = process.stdin,
  stdout = process.stdout,
  colorMode = detectHistoryColorMode(),
  tailIntervalMs = 750,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  if (!engine) throw new Error('History TUI requires engine');
  if (!stdin?.isTTY || !stdout?.isTTY) throw new Error('History TUI requires an interactive terminal');

  const guard = new TerminalGuard({ stdin, stdout });
  const renderer = new AnsiDiffRenderer({ stdout, originRow: 1 });
  let sessions = engine.discover();
  let selectedIndex = 0;
  let activeDetailTab = 0;
  let selectedModel = sessions.length ? engine.ensureLoaded(sessions[0].id) : null;
  let liveTail = false;
  let storageMode = false;
  let tailTimer = null;
  let done = false;

  const scheduleTail = () => {
    if (!liveTail || done || tailTimer || !sessions[selectedIndex]) return;
    tailTimer = setTimer(() => {
      tailTimer = null;
      try { engine.tail(sessions[selectedIndex].id); } catch {}
      render(true);
      scheduleTail();
    }, tailIntervalMs);
  };

  const render = (force = false) => {
    const width = Math.max(40, stdout.columns || 100);
    const height = Math.max(12, stdout.rows || 30);
    const frame = renderHistoryFrame({ sessions, selectedIndex, selectedModel, activeDetailTab, width, height, mode: colorMode, liveTail, storageMode });
    if (force) renderer.reset([]);
    renderer.render(frame.lines);
    return frame;
  };

  const loadSelection = () => {
    const selected = sessions[selectedIndex];
    selectedModel = selected ? engine.ensureLoaded(selected.id) : null;
  };

  const cleanup = () => {
    done = true;
    if (tailTimer) clearTimer(tailTimer);
    tailTimer = null;
    try { stdin.off?.('data', onInput); } catch {}
    try { stdout.off?.('resize', onResize); } catch {}
    try { stdin.pause?.(); } catch {}
    guard.restore();
  };

  const onResize = () => render(true);
  let finish;
  const result = new Promise((resolve) => { finish = resolve; });

  const onInput = (data) => {
    const normalized = normalizeHistoryInput(data);
    const action = typeof normalized === 'object' ? normalized.action : normalized;
    if (!action || done) return;
    if (action === 'quit') {
      cleanup();
      finish(0);
      return;
    }
    if (action === 'up' && sessions.length) {
      storageMode = false;
      selectedIndex = (selectedIndex - 1 + sessions.length) % sessions.length;
      loadSelection();
    } else if (action === 'down' && sessions.length) {
      storageMode = false;
      selectedIndex = (selectedIndex + 1) % sessions.length;
      loadSelection();
    } else if (action === 'left') {
      storageMode = false;
      activeDetailTab = (activeDetailTab - 1 + DETAIL_TABS.length) % DETAIL_TABS.length;
    } else if (action === 'right') {
      storageMode = false;
      activeDetailTab = (activeDetailTab + 1) % DETAIL_TABS.length;
    } else if (action === 'storage') storageMode = !storageMode;
    else if (action === 'refresh') {
      const selectedId = sessions[selectedIndex]?.id ?? null;
      sessions = engine.discover();
      const found = selectedId ? sessions.findIndex((item) => item.id === selectedId) : 0;
      selectedIndex = found >= 0 ? found : 0;
      loadSelection();
    } else if (action === 'tail') {
      liveTail = !liveTail;
      if (!liveTail && tailTimer) { clearTimer(tailTimer); tailTimer = null; }
      if (liveTail) scheduleTail();
    } else if (action === 'mouse' && normalized && !normalized.release) {
      storageMode = false;
    }
    render();
  };

  try {
    guard.enterAlternateScreen();
    guard.hideCursor();
    guard.enableMouse();
    guard.enterRawMode();
    stdin.resume?.();
    stdin.on?.('data', onInput);
    stdout.on?.('resize', onResize);
    stdout.write('\x1b[2J\x1b[H');
    render(true);
    return await result;
  } catch (error) {
    cleanup();
    throw error;
  }
}
