import { normalizeArchiveLines } from '../archive/event-normalizer.js';
import { readCommittedJsonlChunk } from '../archive/source-reader.js';
import { normalizePlatformPath } from '../platform/common.js';

export const DEFAULT_MANAGER_OVERLAY_BYTES = 512 * 1024;
export const DEFAULT_MANAGER_OVERLAY_SOURCES = 8;
const OVERLAY_READ_CHUNK_BYTES = 256 * 1024;
const RECENT_LIMIT = 8;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function pathKey(value) {
  return normalizePlatformPath(value) ?? String(value ?? '');
}

function isAgentSpawnTool(name) {
  const clean = String(name ?? '').trim().toLowerCase();
  if (!clean) return false;
  const leaf = clean.split(/[.:/\\]/).filter(Boolean).at(-1) ?? clean;
  return leaf === 'spawn_agent';
}

function pushRecent(list, value) {
  list.push(value);
  while (list.length > RECENT_LIMIT) list.shift();
}

function baselineRevision(row) {
  const tokens = row?.tokens ?? {};
  return [
    row?.archiveCommittedOffset ?? 0,
    row?.archiveLastSuccessAt ?? '',
    row?.threadId ?? '',
    row?.model ?? '',
    row?.reasoning ?? '',
    tokens.input ?? '',
    tokens.cached ?? '',
    tokens.output ?? '',
    tokens.reasoning ?? '',
    tokens.contextWindow ?? '',
    tokens.contextUsed ?? '',
    row?.turnCount ?? '',
    row?.toolCount ?? '',
    row?.errorCount ?? '',
    row?.retryCount ?? '',
    row?.compactionCount ?? ''
  ].join(':');
}

function baselineState(row) {
  const baseOffset = integer(row?.archiveCommittedOffset, 0);
  return {
    key: pathKey(row?.filePath ?? row?.sourcePath),
    filePath: row?.filePath ?? row?.sourcePath ?? null,
    revision: baselineRevision(row),
    baseOffset,
    parsedOffset: baseOffset,
    observedSize: Math.max(baseOffset, integer(row?.archiveObservedFileSize, baseOffset)),
    pendingPartialBytes: 0,
    threadId: row?.threadId ?? null,
    model: row?.model ?? null,
    reasoning: row?.reasoning ?? null,
    tokens: {
      input: numberOrNull(row?.tokens?.input),
      cached: numberOrNull(row?.tokens?.cached),
      output: numberOrNull(row?.tokens?.output),
      reasoning: numberOrNull(row?.tokens?.reasoning),
      contextWindow: numberOrNull(row?.tokens?.contextWindow),
      contextUsed: numberOrNull(row?.tokens?.contextUsed)
    },
    turnCount: integer(row?.turnCount, 0),
    toolCount: integer(row?.toolCount, 0),
    agentSpawnCount: numberOrNull(row?.agentSpawnCount),
    errorCount: integer(row?.errorCount, 0),
    retryCount: integer(row?.retryCount, 0),
    compactionCount: integer(row?.compactionCount, 0),
    currentTurnStartedAtMs: null,
    lastTurnCompletedAtMs: numberOrNull(row?.lastTurnCompletedAtMs),
    lastTurnDurationMs: numberOrNull(row?.lastTurnDurationMs),
    lastEventAtMs: numberOrNull(row?.lastActivityAtMs),
    recentErrors: [],
    recentRetries: [],
    recentCompactions: [],
    observationGap: false,
    error: null,
    caughtUp: false
  };
}

function applyEvent(state, event) {
  if (!event) return;
  const atMs = numberOrNull(event.atMs);
  if (atMs != null) state.lastEventAtMs = Math.max(state.lastEventAtMs ?? 0, atMs);

  if (event.kind === 'session-meta') {
    state.threadId = event.threadId ?? state.threadId;
    state.model = event.model ?? state.model;
    state.reasoning = event.reasoning ?? state.reasoning;
    return;
  }
  if (event.kind === 'model-settings') {
    state.model = event.model ?? state.model;
    state.reasoning = event.reasoning ?? state.reasoning;
    return;
  }
  if (event.kind === 'actual-model') {
    state.model = event.model ?? state.model;
    return;
  }
  if (event.kind === 'usage') {
    if (event.inputTokens != null) state.tokens.input = event.inputTokens;
    if (event.cachedInputTokens != null) state.tokens.cached = event.cachedInputTokens;
    if (event.outputTokens != null) state.tokens.output = event.outputTokens;
    if (event.reasoningTokens != null) state.tokens.reasoning = event.reasoningTokens;
    if (event.contextWindow != null) state.tokens.contextWindow = event.contextWindow;
    if (event.contextUsed != null) state.tokens.contextUsed = event.contextUsed;
    return;
  }
  if (event.kind === 'turn-start') {
    state.turnCount += 1;
    state.currentTurnStartedAtMs = atMs;
    return;
  }
  if (event.kind === 'turn-complete') {
    if (atMs != null) {
      state.lastTurnCompletedAtMs = atMs;
      if (state.currentTurnStartedAtMs != null && atMs >= state.currentTurnStartedAtMs) {
        state.lastTurnDurationMs = atMs - state.currentTurnStartedAtMs;
      }
    }
    state.currentTurnStartedAtMs = null;
    if (event.error) {
      state.errorCount += 1;
      pushRecent(state.recentErrors, { atMs, detail: event.error });
    }
    return;
  }
  if (event.kind === 'tool-start') {
    state.toolCount += 1;
    if (isAgentSpawnTool(event.tool)) state.agentSpawnCount = (state.agentSpawnCount ?? 0) + 1;
    return;
  }
  if (event.kind === 'error') {
    state.errorCount += 1;
    pushRecent(state.recentErrors, { atMs, detail: event.detail ?? null });
    return;
  }
  if (event.kind === 'retry') {
    state.retryCount += 1;
    pushRecent(state.recentRetries, { atMs, detail: event.detail ?? null });
    return;
  }
  if (event.kind === 'compaction') {
    state.compactionCount += 1;
    pushRecent(state.recentCompactions, { atMs });
    return;
  }
  if (event.kind === 'archive-parse-error') state.observationGap = true;
}

function snapshotState(state) {
  if (!state) return null;
  return {
    baseOffset: state.baseOffset,
    parsedOffset: state.parsedOffset,
    observedSize: state.observedSize,
    pendingByteCount: Math.max(0, integer(state.observedSize, 0) - integer(state.parsedOffset, 0)),
    pendingPartialBytes: integer(state.pendingPartialBytes, 0),
    caughtUp: state.caughtUp === true,
    threadId: state.threadId,
    model: state.model,
    reasoning: state.reasoning,
    tokens: { ...state.tokens },
    turnCount: state.turnCount,
    toolCount: state.toolCount,
    agentSpawnCount: state.agentSpawnCount,
    errorCount: state.errorCount,
    retryCount: state.retryCount,
    compactionCount: state.compactionCount,
    lastTurnCompletedAtMs: state.lastTurnCompletedAtMs,
    lastTurnDurationMs: state.lastTurnDurationMs,
    lastEventAtMs: state.lastEventAtMs,
    recentErrors: [...state.recentErrors],
    recentRetries: [...state.recentRetries],
    recentCompactions: [...state.recentCompactions],
    observationGap: state.observationGap,
    error: state.error
  };
}

function snapshotSignature(snapshot) {
  if (!snapshot) return '';
  const tokens = snapshot.tokens ?? {};
  return [
    snapshot.baseOffset,
    snapshot.parsedOffset,
    snapshot.observedSize,
    snapshot.caughtUp ? 1 : 0,
    snapshot.model ?? '',
    snapshot.reasoning ?? '',
    tokens.input ?? '',
    tokens.cached ?? '',
    tokens.output ?? '',
    tokens.reasoning ?? '',
    tokens.contextWindow ?? '',
    tokens.contextUsed ?? '',
    snapshot.turnCount ?? '',
    snapshot.toolCount ?? '',
    snapshot.errorCount ?? '',
    snapshot.retryCount ?? '',
    snapshot.compactionCount ?? '',
    snapshot.lastEventAtMs ?? '',
    snapshot.observationGap ? 1 : 0,
    snapshot.error ?? ''
  ].join(':');
}

function eligibleArchiveRow(row) {
  return Boolean(
    row?.archiveBacked
    && row?.rawSourceExists !== false
    && row?.archiveVerified !== false
    && ['READY', 'CATCHING_UP'].includes(row?.archiveSyncState)
    && (row?.filePath || row?.sourcePath)
  );
}

function candidateOrder(left, right) {
  const liveDelta = (right.raw?.state === 'LIVE' ? 1 : 0) - (left.raw?.state === 'LIVE' ? 1 : 0);
  if (liveDelta) return liveDelta;
  return Number(right.raw?.lastActivityAtMs ?? right.raw?.modifiedAtMs ?? 0)
    - Number(left.raw?.lastActivityAtMs ?? left.raw?.modifiedAtMs ?? 0);
}

export class ManagerArchiveLiveOverlay {
  constructor({
    readChunk = readCommittedJsonlChunk,
    normalizeLines = normalizeArchiveLines,
    maxBytesPerUpdate = DEFAULT_MANAGER_OVERLAY_BYTES,
    maxSourcesPerUpdate = DEFAULT_MANAGER_OVERLAY_SOURCES
  } = {}) {
    this.readChunk = readChunk;
    this.normalizeLines = normalizeLines;
    this.maxBytesPerUpdate = positiveInteger(maxBytesPerUpdate, DEFAULT_MANAGER_OVERLAY_BYTES);
    this.maxSourcesPerUpdate = positiveInteger(maxSourcesPerUpdate, DEFAULT_MANAGER_OVERLAY_SOURCES);
    this.cache = new Map();
  }

  reset(filePath = null) {
    if (filePath == null) {
      const had = this.cache.size > 0;
      this.cache.clear();
      return had;
    }
    return this.cache.delete(pathKey(filePath));
  }

  async updateOne(raw, archive) {
    const key = pathKey(raw?.filePath ?? archive?.filePath ?? archive?.sourcePath);
    const revision = baselineRevision(archive);
    let state = this.cache.get(key);
    if (!state || state.revision !== revision) {
      state = baselineState(archive);
      state.key = key;
      state.filePath = raw?.filePath ?? archive?.filePath ?? archive?.sourcePath ?? null;
      this.cache.set(key, state);
    }

    const rawSize = integer(raw?.fileSizeBytes, integer(archive?.archiveObservedFileSize, state.baseOffset));
    state.observedSize = Math.max(state.observedSize, rawSize);
    state.error = null;

    if (!state.filePath) {
      state.error = 'overlay-source-missing';
      state.observationGap = true;
      state.caughtUp = false;
      return snapshotState(state);
    }
    if (rawSize < state.baseOffset) {
      state.error = 'overlay-source-truncated';
      state.observationGap = true;
      state.caughtUp = false;
      return snapshotState(state);
    }

    let budget = this.maxBytesPerUpdate;
    while (state.parsedOffset < rawSize && budget > 0) {
      const beforeOffset = state.parsedOffset;
      const chunkBudget = Math.max(1, budget);
      let chunk;
      try {
        chunk = await this.readChunk(state.filePath, {
          committedOffset: beforeOffset,
          maxBytes: Math.min(OVERLAY_READ_CHUNK_BYTES, chunkBudget),
          maxRecordBytes: chunkBudget,
          maxOversizeScanBytes: chunkBudget
        });
      } catch (error) {
        state.error = error?.message ?? String(error);
        state.observationGap = true;
        break;
      }

      state.observedSize = Math.max(rawSize, integer(chunk?.observedFileSize, rawSize));
      state.pendingPartialBytes = integer(chunk?.pendingPartialBytes, 0);
      if (chunk?.truncated) {
        state.error = 'overlay-source-truncated';
        state.observationGap = true;
        break;
      }

      const nextOffset = integer(chunk?.commitCandidateOffset, beforeOffset);
      if (nextOffset <= beforeOffset) break;

      const normalized = this.normalizeLines(chunk?.lines ?? [], { sessionId: state.threadId });
      if (normalized?.sessionId) state.threadId = normalized.sessionId;
      for (const event of normalized?.events ?? []) applyEvent(state, event);
      if ((normalized?.parseErrors?.length ?? 0) > 0) state.observationGap = true;

      state.parsedOffset = nextOffset;
      const spent = Math.max(1, integer(chunk?.bytesRead, nextOffset - beforeOffset));
      budget = Math.max(0, budget - spent);
      if (chunk?.highWaterVerified) break;
    }

    state.caughtUp = state.parsedOffset >= state.observedSize;
    return snapshotState(state);
  }

  async update(rawRows = [], archiveRows = []) {
    const archiveByPath = new Map();
    for (const row of Array.isArray(archiveRows) ? archiveRows : []) {
      if (!eligibleArchiveRow(row)) continue;
      archiveByPath.set(pathKey(row.filePath ?? row.sourcePath), row);
    }

    const candidates = [];
    const active = new Set();
    for (const raw of Array.isArray(rawRows) ? rawRows : []) {
      const key = pathKey(raw?.filePath);
      const archive = archiveByPath.get(key);
      if (!archive) continue;
      active.add(key);
      candidates.push({ key, raw, archive });
    }
    candidates.sort(candidateOrder);

    for (const key of [...this.cache.keys()]) if (!active.has(key)) this.cache.delete(key);

    let changed = false;
    let readSourceCount = 0;
    for (const candidate of candidates.slice(0, this.maxSourcesPerUpdate)) {
      const before = snapshotSignature(snapshotState(this.cache.get(candidate.key)));
      const after = await this.updateOne(candidate.raw, candidate.archive);
      if (snapshotSignature(after) !== before) changed = true;
      readSourceCount += 1;
    }

    const overlays = new Map();
    for (const candidate of candidates) {
      const snapshot = snapshotState(this.cache.get(candidate.key));
      if (snapshot) overlays.set(candidate.key, snapshot);
    }

    return {
      overlays,
      changed,
      candidateCount: candidates.length,
      readSourceCount
    };
  }
}

export {
  applyEvent as applyManagerArchiveOverlayEvent,
  baselineState as createManagerArchiveOverlayBaseline,
  pathKey as managerArchiveOverlayPathKey
};
