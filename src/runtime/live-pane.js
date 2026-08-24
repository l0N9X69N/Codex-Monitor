import { buildLiveFrame } from '../ui/live-renderer.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';

const SAVE_CURSOR = '\x1b7';
const RESTORE_CURSOR = '\x1b8';

export class LivePaneController {
  constructor({
    stdout = process.stdout,
    state,
    config,
    cwd = process.cwd(),
    activeTab = 'overview',
    debounceMs = 30,
    resizeDebounceMs = 75,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    now = () => Date.now()
  } = {}) {
    this.stdout = stdout;
    this.state = state;
    this.config = config;
    this.cwd = cwd;
    this.activeTab = activeTab;
    this.debounceMs = debounceMs;
    this.resizeDebounceMs = resizeDebounceMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.timer = null;
    this.resizeTimer = null;
    this.disposed = false;
    this.lastGeometry = null;
    this.renderer = new AnsiDiffRenderer({
      stdout: { write: (data) => this.stdout.write(`${SAVE_CURSOR}${data}${RESTORE_CURSOR}`) },
      originRow: 1,
      now
    });
  }

  geometry() {
    const width = Math.max(20, this.stdout.columns || 80);
    const height = Math.max(8, this.stdout.rows || 24);
    const frame = buildLiveFrame({
      state: this.state,
      config: this.config,
      width,
      height,
      activeTab: this.activeTab,
      cwd: this.cwd,
      nowMs: this.now()
    });
    const monitorRows = Math.max(3, frame.rowCount);
    const childRows = Math.max(8, height - monitorRows);
    return { width, height, monitorRows, childRows, originRow: childRows + 1, frame };
  }

  render({ force = false } = {}) {
    if (this.disposed) return null;
    const geometry = this.geometry();
    const changedGeometry = !this.lastGeometry
      || this.lastGeometry.width !== geometry.width
      || this.lastGeometry.height !== geometry.height
      || this.lastGeometry.originRow !== geometry.originRow;
    if (force || changedGeometry) this.renderer.reset([]);
    this.renderer.originRow = geometry.originRow;
    const result = this.renderer.render(geometry.frame.lines);
    this.lastGeometry = geometry;
    return { ...geometry, renderResult: result };
  }

  invalidate({ force = false } = {}) {
    if (this.disposed || this.timer) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.render({ force });
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

  dispose() {
    this.disposed = true;
    if (this.timer) this.clearTimer(this.timer);
    if (this.resizeTimer) this.clearTimer(this.resizeTimer);
    this.timer = null;
    this.resizeTimer = null;
  }
}
