import { SessionManagerCore } from './session-core.js';
import { SessionManagerTracker } from './tracker.js';
import { sessionManagerSummaryLines } from './app.js';

function stableRecent(list = []) {
  return Array.isArray(list)
    ? list.map((item) => `${item?.atMs ?? ''}:${item?.detail ?? ''}`).join(',')
    : '';
}

function rowSignature(row) {
  const tokens = row?.tokens ?? {};
  return [
    row?.id ?? '',
    row?.state ?? '',
    row?.project ?? '',
    row?.model ?? '',
    row?.fileSizeBytes ?? '',
    row?.lastActivityAtMs ?? '',
    tokens.input ?? '',
    tokens.cached ?? '',
    tokens.output ?? '',
    tokens.reasoning ?? '',
    tokens.contextUsed ?? '',
    tokens.contextWindow ?? '',
    row?.turnCount ?? '',
    row?.observedTurnCount ?? '',
    row?.toolCount ?? '',
    row?.observedToolCount ?? '',
    row?.archiveSyncState ?? '',
    row?.archiveVerified === true ? 'verified' : '',
    row?.rawSourceExists === false ? 'archived-raw' : '',
    row?.archiveCommittedOffset ?? '',
    row?.archiveObservedFileSize ?? '',
    row?.archiveLastError ?? '',
    stableRecent(row?.recentErrors),
    stableRecent(row?.recentRetries),
    stableRecent(row?.recentCompactions)
  ].join(':');
}

function selectedDetailSignature(detail) {
  if (!detail) return '';
  const analytics = detail.analytics ?? {};
  const contextPoints = analytics.context?.points ?? [];
  const tokenPoints = analytics.tokens?.points ?? [];
  const turns = analytics.turns?.items ?? [];
  const tools = analytics.tools?.events ?? [];
  const signals = analytics.signals ?? [];
  const lastContext = contextPoints.at?.(-1) ?? null;
  const lastToken = tokenPoints.at?.(-1) ?? null;
  const lastTurn = turns.at?.(-1) ?? null;
  const lastTool = tools.at?.(-1) ?? null;
  const lastSignal = signals.at?.(-1) ?? null;
  return [
    detail.id ?? '',
    detail.info?.parsedLines ?? '',
    detail.info?.lastEventAtMs ?? '',
    detail.timeline?.length ?? 0,
    contextPoints.length,
    lastContext?.atMs ?? '',
    lastContext?.used ?? '',
    tokenPoints.length,
    lastToken?.atMs ?? '',
    lastToken?.total ?? '',
    turns.length,
    lastTurn?.completedAtMs ?? lastTurn?.startedAtMs ?? '',
    lastTurn?.durationMs ?? '',
    lastTurn?.toolCount ?? '',
    tools.length,
    lastTool?.endAtMs ?? lastTool?.atMs ?? '',
    signals.length,
    lastSignal?.atMs ?? '',
    lastSignal?.kind ?? ''
  ].join(':');
}

function snapshotSignature(result) {
  const rows = (result.rows ?? []).map(rowSignature).join('|');
  const diagnostics = result.processDiagnostics ?? {};
  const wake = result.archiveWake ?? {};
  return [
    rows,
    selectedDetailSignature(result.selectedDetail),
    diagnostics.codexProcessCount,
    diagnostics.codexRootCount,
    diagnostics.mappedSessionCount,
    diagnostics.exactMatchCount,
    diagnostics.stickyMatchCount,
    diagnostics.startMatchCount,
    diagnostics.missingAssociationCount,
    result.processError ?? '',
    result.archiveEnabled === true ? 'archive-on' : '',
    result.archiveAvailable === true ? 'archive-open' : '',
    result.archiveSourceScanComplete === true ? 'scan-complete' : '',
    result.archiveSyncState ?? '',
    result.archivePendingFileCount ?? '',
    result.archivePendingByteCount ?? '',
    result.archiveSourceCount ?? '',
    result.archiveReconcileGeneration ?? '',
    result.archiveLastSuccessfulReconcile ?? '',
    result.archiveLastSeenSourceScan ?? '',
    result.archiveHookLastSeenAt ?? '',
    result.archiveWatcherLastSeenAt ?? '',
    result.archiveServiceInstanceId ?? '',
    wake.reason ?? '',
    wake.running === true ? 'wake-running' : '',
    wake.started === true ? 'wake-started' : '',
    wake.error ?? '',
    result.archiveError ?? ''
  ].join('::');
}

export class SessionManagerRuntime {
  constructor({
    tracker,
    onSnapshot = null,
    intervalMs = 250,
    setTimeoutRef = setTimeout,
    clearTimeoutRef = clearTimeout
  } = {}) {
    if (!tracker) throw new Error('SessionManagerRuntime requires tracker');
    this.tracker = tracker;
    this.onSnapshot = typeof onSnapshot === 'function' ? onSnapshot : null;
    this.intervalMs = Math.max(50, Number(intervalMs) || 250);
    this.setTimeoutRef = setTimeoutRef;
    this.clearTimeoutRef = clearTimeoutRef;
    this.running = false;
    this.timer = null;
    this.lastSignature = null;
    this.stopResolve = null;
    this.stopPromise = null;
  }

  async tick() {
    const result = await this.tracker.tick();
    const signature = snapshotSignature(result);
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      await this.onSnapshot?.(result);
    }
    return result;
  }

  scheduleNext() {
    if (!this.running) return;
    this.timer = this.setTimeoutRef(async () => {
      this.timer = null;
      if (!this.running) return;
      try { await this.tick(); } catch {}
      this.scheduleNext();
    }, this.intervalMs);
  }

  async start() {
    if (this.running) return this.stopPromise;
    this.running = true;
    this.stopPromise = new Promise((resolve) => { this.stopResolve = resolve; });
    await this.tick();
    this.scheduleNext();
    return this.stopPromise;
  }

  stop() {
    if (!this.running) return false;
    this.running = false;
    if (this.timer != null) {
      this.clearTimeoutRef(this.timer);
      this.timer = null;
    }
    const resolve = this.stopResolve;
    this.stopResolve = null;
    resolve?.();
    return true;
  }
}

export async function runSessionManagerRuntime({
  platformAdapter,
  stdout = process.stdout,
  fsRef,
  now = () => Date.now(),
  processRef = process,
  intervalMs = 250
} = {}) {
  if (!platformAdapter) throw new Error('Session Manager requires platform adapter');
  const sessionsPath = platformAdapter.paths()?.sessions ?? null;
  const core = new SessionManagerCore({ sessionsPath, fsRef, now });
  const tracker = new SessionManagerTracker({ core, platformAdapter, now });
  const runtime = new SessionManagerRuntime({
    tracker,
    intervalMs,
    onSnapshot(result) {
      stdout.write(`${sessionManagerSummaryLines(
        result.sessions,
        result.processDiagnostics,
        result.processError
      ).join('\n')}\n`);
    }
  });

  const stop = () => runtime.stop();
  processRef?.once?.('SIGINT', stop);
  processRef?.once?.('SIGTERM', stop);
  try {
    await runtime.start();
  } finally {
    processRef?.removeListener?.('SIGINT', stop);
    processRef?.removeListener?.('SIGTERM', stop);
    tracker.close?.();
    await platformAdapter.cleanup?.();
  }
  return { code: 0, core, tracker, runtime };
}

export {
  snapshotSignature as sessionManagerSnapshotSignature,
  rowSignature as sessionManagerRowSignature,
  selectedDetailSignature as sessionManagerSelectedDetailSignature
};
