import { TerminalGuard } from '../terminal/guard.js';
import { AnsiDiffRenderer } from '../terminal/diff-renderer.js';
import { detectHistoryColorMode, hpaint } from '../history/theme.js';
import { truncateCells } from '../ui/cell-width.js';
import { SessionManagerCore, buildProcessEvidence } from './session-core.js';
import { SessionManagerTracker } from './tracker.js';
import { SessionManagerRuntime } from './runtime.js';
import { renderSessionDashboardWithPreview } from './dashboard-preview-render.js';
import { MANAGER_INSPECT_TABS, renderSessionInspect } from './inspect-render.js';
import { nextManagerScope, nextManagerSort, nextManagerView, normalizeManagerInput } from './input.js';
import { ManagerTelemetrySeries } from './telemetry-series.js';
import { nextTimelineFilter } from './timeline.js';
import { SelectedActivityPreview } from './activity-preview.js';
import { activityPreviewCapacity } from './activity-preview-capacity.js';
import { SessionStorageSummaryCache, summarizeSelectedSessions } from './storage-summary.js';
import { deleteSelectedSessions } from './delete-safety.js';
import { renderClearConfirmation, renderStorageManager } from './storage-render.js';
import { ManagerConfigController } from './config-controller.js';
import { renderManagerConfig } from './config-render.js';
import {
  managerArchiveBadge,
  managerArchiveStatusFromResult,
  managerArchiveStatusToken,
  managerSelectedArchiveBadge
} from './index-status.js';

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

function clearReportStatus(report) {
  if (!report) return '';
  const parts = [`Cleared ${report.deleted?.length ?? 0}`];
  if (report.rejected?.length) parts.push(`protected ${report.rejected.length}`);
  if (report.errors?.length) parts.push(`failed ${report.errors.length}`);
  return parts.join(' · ');
}

function rowStorageSize(row) {
  const value = Number(row?.fileSizeBytes ?? row?.sizeBytes);
  return Number.isFinite(value) && value >= 0 ? value : -1;
}

function storageSortedRows(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const sizeDelta = rowStorageSize(b) - rowStorageSize(a);
    if (sizeDelta) return sizeDelta;
    const activityDelta = Number(b?.lastActivityAtMs ?? b?.modifiedAtMs ?? 0) - Number(a?.lastActivityAtMs ?? a?.modifiedAtMs ?? 0);
    if (activityDelta) return activityDelta;
    return String(a?.project ?? '').localeCompare(String(b?.project ?? ''));
  });
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
  monitorConfig = null,
  configPath = null,
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
  const activityPreviewReader = new SelectedActivityPreview({ fsRef });
  const storageSummaryCache = new SessionStorageSummaryCache({ now });
  const configController = new ManagerConfigController({
    config: monitorConfig ?? { theme },
    filePath: configPath ?? undefined
  });

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
  let storageOpen = false;
  let configOpen = false;
  let storageCursorIndex = 0;
  let clearConfirming = false;
  let clearStatus = '';
  const clearSelectedIds = new Set();
  let selectedDetail = null;
  let archiveInspectOpen = false;
  let inspectTab = 'info';
  let timelineFilter = 'all';
  let timelineSearch = '';
  let timelineSearchDraft = '';
  let timelineSearching = false;
  let timelineSelectedIndex = Number.MAX_SAFE_INTEGER;
  let timelineDetail = false;
  let done = false;
  let lastFrame = null;
  let lastInspectFrame = null;
  let telemetry = telemetrySeries.snapshot();
  let telemetryTimer = null;
  let archiveStatus = managerArchiveStatusFromResult({ archiveEnabled: monitorConfig?.archive?.enabled === true });

  const inspectOpen = () => Boolean(core.selectedId || archiveInspectOpen);
  const selectedDashboardRow = () => {
    if (!lastFrame?.model?.rows?.length) return null;
    const index = Math.max(0, Math.min(lastFrame.model.rows.length - 1, selectedIndex));
    return lastFrame.model.rows[index] ?? lastFrame.model.selected ?? null;
  };

  const visibleDashboardRows = () => lastFrame?.model?.rows ?? [];
  const currentStorageRows = () => storageSortedRows(rows);
  const clampStorageCursor = (value = storageCursorIndex) => {
    const list = currentStorageRows();
    if (!list.length) {
      storageCursorIndex = 0;
      return 0;
    }
    storageCursorIndex = Math.max(0, Math.min(list.length - 1, Number(value) || 0));
    return storageCursorIndex;
  };
  const currentStorageRow = () => {
    const list = currentStorageRows();
    const index = clampStorageCursor();
    return list[index] ?? null;
  };
  const syncStorageCursorToDashboard = () => {
    const selected = selectedDashboardRow();
    const list = currentStorageRows();
    if (!list.length) {
      storageCursorIndex = 0;
      return;
    }
    const match = selected ? list.findIndex((row) => row.id === selected.id) : -1;
    storageCursorIndex = match >= 0 ? match : Math.max(0, Math.min(storageCursorIndex, list.length - 1));
  };
  const pruneClearSelection = () => {
    const valid = new Set(rows.filter((row) => row?.state === 'ENDED').map((row) => row.id));
    for (const id of clearSelectedIds) if (!valid.has(id)) clearSelectedIds.delete(id);
  };

  const draw = (force = false) => {
    if (done) return null;
    const width = Math.max(44, stdout.columns || 120);
    const height = Math.max(16, stdout.rows || 36);
    pruneClearSelection();
    clampStorageCursor();
    const storageSummary = storageSummaryCache.get(rows, { nowMs: now() });
    const selectedSummary = summarizeSelectedSessions(rows, clearSelectedIds);
    let frame;

    if (configOpen) {
      frame = renderManagerConfig({ controller: configController, width, height, mode: colorMode });
    } else if (clearConfirming) {
      frame = renderClearConfirmation({ rows, selectedIds: clearSelectedIds, selectedSummary, width, height, mode: colorMode });
    } else if (storageOpen) {
      frame = renderStorageManager({
        summary: storageSummary,
        selectedSummary,
        selectedIds: clearSelectedIds,
        rows: currentStorageRows(),
        cursorIndex: storageCursorIndex,
        width,
        height,
        mode: colorMode,
        status: clearStatus
      });
    } else if (inspectOpen() && selectedDetail) {
      frame = renderSessionInspect({
        detail: selectedDetail,
        width,
        height,
        mode: colorMode,
        activeTab: inspectTab,
        timelineFilter,
        timelineSearch,
        timelineSearchDraft,
        timelineSearching,
        timelineSelectedIndex,
        timelineDetail
      });
    } else {
      const previewCapacity = activityPreviewCapacity({ width, height, viewMode, telemetry });
      const activityPreview = previewCapacity > 0
        ? activityPreviewReader.read(selectedDashboardRow(), { nowMs: now(), targetEvents: previewCapacity })
        : null;
      frame = renderSessionDashboardWithPreview({
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
        telemetry,
        activityPreview
      });
      if (frame.lines?.length) {
        const indexBadge = managerArchiveBadge(archiveStatus);
        frame.lines[0] = truncateCells(`${frame.lines[0]}  ${hpaint(indexBadge, managerArchiveStatusToken(archiveStatus), colorMode)}`, width, '');
        const selectedIndexBadge = managerSelectedArchiveBadge(frame.model?.selected);
        if (selectedIndexBadge && frame.lines[1] != null) {
          frame.lines[1] = truncateCells(`${frame.lines[1]}  ${hpaint(selectedIndexBadge, 'dim', colorMode)}`, width, '');
        }
        frame.lines[frame.lines.length - 1] = truncateCells(`${frame.lines.at(-1)}  ${hpaint('M storage', 'dim', colorMode)}  ${hpaint('C config', 'dim', colorMode)}`, width, '');
      }
    }

    if (!configOpen && !inspectOpen() && !storageOpen && !clearConfirming && frame.model) {
      selectedIndex = frame.model.selectedIndex < 0 ? 0 : frame.model.selectedIndex;
      selectedId = frame.model.selected?.id ?? null;
      lastFrame = frame;
      lastInspectFrame = null;
    } else if (!configOpen && inspectOpen() && !storageOpen && !clearConfirming) {
      lastInspectFrame = frame;
      if (frame.timeline && frame.timeline.selectedIndex >= 0) timelineSelectedIndex = frame.timeline.selectedIndex;
    }
    if (force) renderer.reset([]);
    renderer.render(frame.lines);
    return frame;
  };

  const sampleTelemetry = () => {
    if (done || configOpen || inspectOpen() || searching || storageOpen || clearConfirming) return;
    telemetry = telemetrySeries.sample(rows, { scope, search, atMs: now() });
    draw(false);
  };

  const runtime = new SessionManagerRuntime({
    tracker,
    intervalMs,
    onSnapshot(result) {
      rows = result.rows ?? [];
      archiveStatus = managerArchiveStatusFromResult(result);
      selectedDetail = result.selectedDetail ?? selectedDetail;
      storageSummaryCache.invalidate();
      clampStorageCursor();
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
    tracker.close?.();
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

  const timelineCount = () => lastInspectFrame?.timeline?.events?.length ?? 0;
  const clampTimelineIndex = (value) => {
    const count = timelineCount();
    if (!count) return 0;
    return Math.max(0, Math.min(count - 1, Number(value) || 0));
  };

  const toggleClearSelection = (row) => {
    if (!row) return;
    if (row.state !== 'ENDED') {
      clearStatus = `${row.state ?? 'UNKNOWN'} session is protected`;
      return;
    }
    if (clearSelectedIds.has(row.id)) clearSelectedIds.delete(row.id);
    else clearSelectedIds.add(row.id);
    clearStatus = `${clearSelectedIds.size} ENDED selected`;
  };

  const selectEnded = (mode, sourceRows = null) => {
    const source = Array.isArray(sourceRows) ? sourceRows : visibleDashboardRows();
    const eligible = source.filter((row) => row?.state === 'ENDED');
    if (mode === 'none') clearSelectedIds.clear();
    else if (mode === 'all') for (const row of eligible) clearSelectedIds.add(row.id);
    else if (mode === 'invert') {
      for (const row of eligible) {
        if (clearSelectedIds.has(row.id)) clearSelectedIds.delete(row.id);
        else clearSelectedIds.add(row.id);
      }
    }
    clearStatus = `${clearSelectedIds.size} ENDED selected`;
  };

  const confirmClear = async () => {
    let freshProcesses = null;
    try { freshProcesses = await platformAdapter.getProcessTree?.(); } catch { freshProcesses = null; }
    const freshEvidence = buildProcessEvidence(Array.isArray(freshProcesses) ? freshProcesses : null, {
      nowMs: now(),
      sessions: core.index,
      previousAssociations: tracker.processAssociations
    });
    const report = deleteSelectedSessions(rows, clearSelectedIds, { sessionsPath, fsRef, processEvidence: freshEvidence });
    for (const item of report.deleted) clearSelectedIds.delete(item.id);
    clearStatus = clearReportStatus(report);
    clearConfirming = false;
    storageOpen = true;
    core.discover({ processEvidence: freshEvidence, refreshKnownMetadata: true });
    rows = core.rows();
    tracker.cachedRows = rows;
    tracker.hasCachedRows = true;
    storageSummaryCache.invalidate();
    clampStorageCursor();
    draw(true);
  };

  const handleInput = async (data) => {
    if (done) return;
    const normalized = normalizeManagerInput(data, {
      searching: searching || timelineSearching,
      confirmingDelete: clearConfirming,
      storageOpen,
      configOpen
    });
    if (normalized == null) return;
    const action = typeof normalized === 'object' ? normalized.action : normalized;
    if (!action) return;

    if (configOpen) {
      if (action === 'config-close') configOpen = false;
      else if (action === 'config-tab-next') configController.moveTab(1);
      else if (action === 'config-tab-prev') configController.moveTab(-1);
      else if (action === 'up') configController.moveCursor(-1);
      else if (action === 'down') configController.moveCursor(1);
      else if (action === 'home') configController.cursorHome();
      else if (action === 'end') configController.cursorEnd();
      else if (action === 'config-edit') configController.editCurrent(1);
      else if (action === 'config-save') configController.save();
      else if (action === 'config-revert') configController.revert();
      draw(action === 'config-close' || action === 'config-save');
      return;
    }

    if (clearConfirming) {
      if (action === 'delete-cancel') {
        clearConfirming = false;
        clearStatus = 'Clear cancelled';
        draw(true);
      } else if (action === 'delete-confirm') {
        await confirmClear();
      }
      return;
    }

    if (storageOpen) {
      const storageRows = currentStorageRows();
      const page = Math.max(5, (stdout.rows || 30) - 12);
      if (action === 'quit' || action === 'storage-view') {
        storageOpen = false;
        clearStatus = '';
        draw(true);
      } else if (action === 'up') {
        clampStorageCursor(storageCursorIndex - 1);
        draw(false);
      } else if (action === 'down') {
        clampStorageCursor(storageCursorIndex + 1);
        draw(false);
      } else if (action === 'page-up') {
        clampStorageCursor(storageCursorIndex - page);
        draw(false);
      } else if (action === 'page-down') {
        clampStorageCursor(storageCursorIndex + page);
        draw(false);
      } else if (action === 'home') {
        clampStorageCursor(0);
        draw(false);
      } else if (action === 'end') {
        clampStorageCursor(storageRows.length - 1);
        draw(false);
      } else if (action === 'select-toggle') {
        toggleClearSelection(currentStorageRow());
        draw(false);
      } else if (action === 'select-none') {
        selectEnded('none', storageRows);
        draw(false);
      } else if (action === 'select-all') {
        selectEnded('all', storageRows);
        draw(false);
      } else if (action === 'select-invert') {
        selectEnded('invert', storageRows);
        draw(false);
      } else if (action === 'delete-selected') {
        if (clearSelectedIds.size) clearConfirming = true;
        else clearStatus = 'No ENDED sessions selected';
        draw(true);
      }
      return;
    }

    if (action === 'config-view') {
      configOpen = true;
      draw(true);
      return;
    }

    if (inspectOpen()) {
      if (timelineSearching) {
        if (action === 'search-cancel') {
          timelineSearching = false;
          timelineSearchDraft = timelineSearch;
        } else if (action === 'search-accept') {
          timelineSearching = false;
          timelineSearch = timelineSearchDraft.trim();
          timelineSelectedIndex = Number.MAX_SAFE_INTEGER;
        } else if (action === 'search-backspace') {
          timelineSearchDraft = [...timelineSearchDraft].slice(0, -1).join('');
        } else if (action === 'search-text') {
          timelineSearchDraft += normalized.text;
        }
        draw(false);
        return;
      }

      if (timelineDetail) {
        if (action === 'quit') {
          timelineDetail = false;
          draw(false);
        }
        return;
      }

      if (action === 'quit') {
        core.releaseSelection();
        archiveInspectOpen = false;
        selectedDetail = null;
        inspectTab = 'info';
        timelineFilter = 'all';
        timelineSearch = '';
        timelineSearchDraft = '';
        timelineSearching = false;
        timelineSelectedIndex = Number.MAX_SAFE_INTEGER;
        timelineDetail = false;
        rebaselineTelemetry();
        draw(true);
      } else if (action === 'tab' || action === 'right') {
        inspectTab = nextInspectTab(inspectTab, 1);
        timelineDetail = false;
        draw(false);
      } else if (action === 'left') {
        inspectTab = nextInspectTab(inspectTab, -1);
        timelineDetail = false;
        draw(false);
      } else if (inspectTab === 'timeline') {
        if (action === 'up') timelineSelectedIndex = clampTimelineIndex(timelineSelectedIndex - 1);
        else if (action === 'down') timelineSelectedIndex = clampTimelineIndex(timelineSelectedIndex + 1);
        else if (action === 'page-up') timelineSelectedIndex = clampTimelineIndex(timelineSelectedIndex - Math.max(5, (stdout.rows || 30) - 10));
        else if (action === 'page-down') timelineSelectedIndex = clampTimelineIndex(timelineSelectedIndex + Math.max(5, (stdout.rows || 30) - 10));
        else if (action === 'home') timelineSelectedIndex = 0;
        else if (action === 'end') timelineSelectedIndex = Math.max(0, timelineCount() - 1);
        else if (action === 'filter') {
          timelineFilter = nextTimelineFilter(timelineFilter);
          timelineSelectedIndex = Number.MAX_SAFE_INTEGER;
        } else if (action === 'search') {
          timelineSearching = true;
          timelineSearchDraft = timelineSearch;
        } else if (action === 'inspect' && lastInspectFrame?.timeline?.selected) timelineDetail = true;
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
      } else if (action === 'search-backspace') searchDraft = [...searchDraft].slice(0, -1).join('');
      else if (action === 'search-text') searchDraft += normalized.text;
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
    } else if (action === 'direction') direction = direction === 'desc' ? 'asc' : 'desc';
    else if (action === 'view') viewMode = nextManagerView(viewMode);
    else if (action === 'storage-view') {
      syncStorageCursorToDashboard();
      storageOpen = true;
      clearStatus = '';
      forceDraw = true;
    } else if (action === 'up' && lastFrame?.model?.rows?.length) {
      selectedIndex = Math.max(0, selectedIndex - 1);
      selectedId = lastFrame.model.rows[selectedIndex]?.id ?? selectedId;
    } else if (action === 'down' && lastFrame?.model?.rows?.length) {
      selectedIndex = Math.min(lastFrame.model.rows.length - 1, selectedIndex + 1);
      selectedId = lastFrame.model.rows[selectedIndex]?.id ?? selectedId;
    } else if (action === 'inspect') {
      const selected = lastFrame?.model?.selected;
      if (selected) {
        const archiveDetail = tracker.archiveDetailForRow(selected);
        if (archiveDetail) {
          core.releaseSelection();
          archiveInspectOpen = true;
          selectedDetail = archiveDetail;
        } else {
          archiveInspectOpen = false;
          core.select(selected.id);
          selectedDetail = core.selectedDetail();
        }
        if (selectedDetail) {
          inspectTab = 'timeline';
          timelineFilter = 'all';
          timelineSearch = '';
          timelineSearchDraft = '';
          timelineSearching = false;
          timelineSelectedIndex = Number.MAX_SAFE_INTEGER;
          timelineDetail = false;
          forceDraw = true;
        }
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
    return {
      code,
      core,
      tracker,
      runtime,
      viewMode,
      theme,
      colorMode,
      telemetry,
      clearSelectedIds,
      clearStatus,
      storageCursorIndex,
      configOpen,
      archiveInspectOpen,
      configDirty: configController.dirty,
      config: configController.savedConfig,
      archiveStatus
    };
  } finally {
    processRef?.removeListener?.('SIGINT', onSignal);
    processRef?.removeListener?.('SIGTERM', onSignal);
    if (!done) await cleanup();
  }
}
