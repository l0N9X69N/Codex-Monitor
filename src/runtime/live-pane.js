import { buildLiveFrame } from '../ui/live-renderer.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';

const SAVE_CURSOR = '\x1b7';
const RESTORE_CURSOR = '\x1b8';
const MIN_CHILD_ROWS = 8;

function clearRows(originRow, count) {
  let output = '';
  for (let index = 0; index < count; index += 1) output += `\x1b[${originRow + index};1H\x1b[K`;
  return output;
}

export class LivePaneController {
  constructor({
    stdout = process.stdout,
    state,
    config,
    cwd = process.cwd(),
    activeTab = 'overview',
    debounceMs = 30,
    resizeDebounceMs = 75,
    hysteresisCells = 4,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    now = () => Date.now()
  } = {}) {
    this.stdout = stdout;
    this.state = state;
    this.config = config;
    this.cwd = cwd;
    this.activeTab = config?.tabs?.includes(activeTab) ? activeTab : (config?.tabs?.[0] ?? 'overview');
    this.debounceMs = debounceMs;
    this.resizeDebounceMs = resizeDebounceMs;
    this.hysteresisCells = hysteresisCells;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.timer = null;
    this.resizeTimer = null;
    this.pendingForce = false;
    this.disposed = false;
    this.lastGeometry = null;
    this.renderer = new AnsiDiffRenderer({
      stdout: { write: (data) => this.stdout.write(`${SAVE_CURSOR}${data}${RESTORE_CURSOR}`) },
      originRow: 1,
      now
    });
  }

  setActiveTab(tab) {
    if (!this.config?.tabs?.includes(tab) || tab === this.activeTab) return false;
    this.activeTab = tab;
    this.render({ force: true });
    return true;
  }

  shiftTab(delta = 1) {
    const tabs = this.config?.tabs ?? ['overview'];
    if (tabs.length < 2) return this.activeTab;
    const current = Math.max(0, tabs.indexOf(this.activeTab));
    const next = (current + delta + tabs.length) % tabs.length;
    this.setActiveTab(tabs[next]);
    return this.activeTab;
  }

  geometry() {
    const width = Math.max(20, this.stdout.columns || 80);
    const height = Math.max(8, this.stdout.rows || 24);
    const rawFrame = buildLiveFrame({
      state: this.state,
      config: this.config,
      width,
      height,
      activeTab: this.activeTab,
      cwd: this.cwd,
      nowMs: this.now(),
      previousLaneCount: this.lastGeometry?.frame?.layout?.laneCount ?? null,
      hysteresisCells: this.hysteresisCells
    });

    const availableMonitorRows = Math.max(0, height - MIN_CHILD_ROWS);
    const monitorRows = Math.min(rawFrame.rowCount, availableMonitorRows);
    const childRows = Math.max(MIN_CHILD_ROWS, height - monitorRows);
    const frame = monitorRows === rawFrame.rowCount
      ? rawFrame
      : { ...rawFrame, lines: rawFrame.lines.slice(0, monitorRows), rowCount: monitorRows };

    return { width, height, monitorRows, childRows, originRow: childRows + 1, frame };
  }

  clear(geometry = this.lastGeometry) {
    if (!geometry || geometry.monitorRows <= 0) return;
    const output = clearRows(geometry.originRow, geometry.monitorRows);
    if (output) this.stdout.write(`${SAVE_CURSOR}${output}${RESTORE_CURSOR}`);
  }

  render({ force = false } = {}) {
    if (this.disposed) return null;
    const geometry = this.geometry();
    const changedGeometry = !this.lastGeometry
      || this.lastGeometry.width !== geometry.width
      || this.lastGeometry.height !== geometry.height
      || this.lastGeometry.originRow !== geometry.originRow
      || this.lastGeometry.monitorRows !== geometry.monitorRows;

    if (changedGeometry && this.lastGeometry) this.clear(this.lastGeometry);
    if (force || changedGeometry) this.renderer.reset([]);
    this.renderer.originRow = geometry.originRow;
    const result = this.renderer.render(geometry.frame.lines);
    this.lastGeometry = geometry;
    return { ...geometry, renderResult: result };
  }

  invalidate({ force = false } = {}) {
    if (this.disposed) return;
    this.pendingForce ||= force;
    if (this.timer) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      const shouldForce = this.pendingForce;
      this.pendingForce = false;
      this.render({ force: shouldForce });
    }, this.debounceMs);
  }

  onResize(callback = null) {
    if (this.disposed) return;
    if (this.resizeTimer) this.clearTimer(this.resizeTimer);
    this.resizeTimer = this.setTimer(() => {
      this.resizeTimer = null;
      const geometry = this.render({ force: true });
      callback?.(geometry);
    }, this.resizeDebounceMs);
  }

  dispose({ clear = true } = {}) {
    if (clear) this.clear();
    this.disposed = true;
    if (this.timer) this.clearTimer(this.timer);
    if (this.resizeTimer) this.clearTimer(this.resizeTimer);
    this.timer = null;
    this.resizeTimer = null;
    this.pendingForce = false;
  }
}
