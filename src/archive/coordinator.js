import { ARCHIVE_PARSER_VERSION, ARCHIVE_SYNC_STATE } from './constants.js';
import { ArchiveHealthStore, needsArchiveSourceReconcile } from './health-store.js';
import { reconcileArchiveSource } from './reconcile.js';
import { scanArchiveSourcesWithHealth } from './source-scan.js';
import { normalizePlatformPath } from '../platform/common.js';

const DEFAULT_MAX_BYTES_PER_SOURCE = 256 * 1024;
const DEFAULT_MAX_SOURCES_PER_CYCLE = 32;
const DEFAULT_MAX_TOTAL_BYTES = 4 * 1024 * 1024;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function queueKey(filePath) {
  return normalizePlatformPath(filePath) ?? String(filePath ?? '');
}

function defaultYieldControl() {
  return new Promise((resolve) => setImmediate(resolve));
}

function normalizeScanResult(value) {
  if (Array.isArray(value)) return { sources: value, complete: true, errors: [], limited: false };
  return {
    sources: Array.isArray(value?.sources) ? value.sources : [],
    complete: value?.complete === true,
    errors: Array.isArray(value?.errors) ? value.errors : [],
    limited: value?.limited === true
  };
}

function sourcePriority(source, ingest) {
  const indexed = Boolean(ingest?.sessionId) || Number(ingest?.committedOffset ?? 0) > 0;
  const mtime = Number(source?.mtimeMs ?? 0) || 0;
  return { indexed, mtime };
}

function compareQueuedSources(leftPath, rightPath, sourceByKey, ingestByKey) {
  const leftKey = queueKey(leftPath);
  const rightKey = queueKey(rightPath);
  const left = sourcePriority(sourceByKey.get(leftKey), ingestByKey.get(leftKey));
  const right = sourcePriority(sourceByKey.get(rightKey), ingestByKey.get(rightKey));
  if (left.indexed !== right.indexed) return left.indexed ? -1 : 1;
  if (left.mtime !== right.mtime) return right.mtime - left.mtime;
  return leftKey.localeCompare(rightKey);
}

export class ArchiveReconcileCoordinator {
  constructor({
    sessionsPath,
    repository,
    parserVersion = ARCHIVE_PARSER_VERSION,
    scanSources = scanArchiveSourcesWithHealth,
    reconcileSource = reconcileArchiveSource,
    healthStore = null,
    yieldControl = defaultYieldControl,
    maxBytesPerSource = DEFAULT_MAX_BYTES_PER_SOURCE,
    maxSourcesPerCycle = DEFAULT_MAX_SOURCES_PER_CYCLE,
    maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES
  } = {}) {
    if (!sessionsPath) throw new Error('ArchiveReconcileCoordinator requires sessionsPath');
    if (!repository) throw new Error('ArchiveReconcileCoordinator requires repository');
    this.sessionsPath = sessionsPath;
    this.repository = repository;
    this.parserVersion = parserVersion;
    this.scanSources = scanSources;
    this.reconcileSource = reconcileSource;
    this.health = healthStore ?? new ArchiveHealthStore(repository);
    this.yieldControl = yieldControl;
    this.maxBytesPerSource = positiveInteger(maxBytesPerSource, DEFAULT_MAX_BYTES_PER_SOURCE);
    this.maxSourcesPerCycle = positiveInteger(maxSourcesPerCycle, DEFAULT_MAX_SOURCES_PER_CYCLE);
    this.maxTotalBytes = positiveInteger(maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES);
    this.queue = [];
    this.queued = new Set();
  }

  suppressionKeys() {
    const db = this.repository?.db;
    if (!db?.prepare) return new Set();
    try {
      return new Set(db.prepare('SELECT source_path FROM archive_suppressions').all().map((row) => queueKey(row.source_path)));
    } catch {
      return new Set();
    }
  }

  enqueue(filePath) {
    if (!filePath) return false;
    const key = queueKey(filePath);
    if (this.queued.has(key)) return false;
    this.queued.add(key);
    this.queue.push(filePath);
    return true;
  }

  get queueDepth() {
    return this.queue.length;
  }

  async runCycle({ maxBytesPerSource = this.maxBytesPerSource, maxSources = this.maxSourcesPerCycle, maxTotalBytes = this.maxTotalBytes } = {}) {
    const perSourceLimit = positiveInteger(maxBytesPerSource, this.maxBytesPerSource);
    const sourceLimit = positiveInteger(maxSources, this.maxSourcesPerCycle);
    const totalLimit = positiveInteger(maxTotalBytes, this.maxTotalBytes);
    const scan = normalizeScanResult(await this.scanSources(this.sessionsPath));
    const suppressions = this.suppressionKeys();
    const sources = scan.sources.filter((source) => !suppressions.has(queueKey(source?.filePath)));
    const sourceByKey = new Map(sources.map((source) => [queueKey(source.filePath), source]));
    const ingestByKey = new Map(sources.map((source) => [queueKey(source.filePath), this.repository.getIngestState(source.filePath)]));
    const tracked = this.health.listTrackedRawSources().filter((item) => !suppressions.has(queueKey(item?.sourcePath)));
    const trackedKeys = new Set(tracked.map((item) => queueKey(item.sourcePath)));
    const newlyPrioritized = [];

    for (const source of sources) {
      const key = queueKey(source.filePath);
      const ingest = ingestByKey.get(key) ?? null;
      if (!needsArchiveSourceReconcile(source, ingest, { parserVersion: this.parserVersion })) continue;
      if (this.enqueue(source.filePath) && sourcePriority(source, ingest).indexed) newlyPrioritized.push(source.filePath);
    }
    for (const item of tracked) if (!sourceByKey.has(queueKey(item.sourcePath))) this.enqueue(item.sourcePath);

    if (newlyPrioritized.length) {
      const priorityKeys = new Set(newlyPrioritized.map((filePath) => queueKey(filePath)));
      const prioritized = this.queue
        .filter((filePath) => priorityKeys.has(queueKey(filePath)))
        .sort((left, right) => compareQueuedSources(left, right, sourceByKey, ingestByKey));
      const waiting = this.queue.filter((filePath) => !priorityKeys.has(queueKey(filePath)));
      this.queue = [...prioritized, ...waiting];
    }

    const generation = this.health.beginGeneration({ sourceCount: sources.length });
    const results = [];
    const errors = [];
    const visited = new Set();
    let bytesRead = 0;
    let processedSourceCount = 0;

    while (this.queue.length && processedSourceCount < sourceLimit) {
      if (processedSourceCount > 0 && bytesRead >= totalLimit) break;
      const filePath = this.queue.shift();
      const key = queueKey(filePath);
      this.queued.delete(key);
      if (visited.has(key) || suppressions.has(key)) continue;
      visited.add(key);

      const source = sourceByKey.get(key) ?? null;
      if (source) {
        const ingest = this.repository.getIngestState(filePath);
        if (!needsArchiveSourceReconcile(source, ingest, { parserVersion: this.parserVersion })) continue;
      } else if (!trackedKeys.has(key)) continue;

      const remaining = Math.max(1, totalLimit - bytesRead);
      const chunkLimit = Math.min(perSourceLimit, remaining);
      try {
        const result = await this.reconcileSource({ filePath, repository: this.repository, parserVersion: this.parserVersion, maxBytes: chunkLimit });
        const consumed = Math.max(0, Number(result?.bytesRead ?? 0));
        bytesRead += consumed;
        processedSourceCount += 1;
        results.push({ filePath, ...result });
        if (result?.state === ARCHIVE_SYNC_STATE.CATCHING_UP || result?.state === ARCHIVE_SYNC_STATE.UNINDEXED) this.enqueue(filePath);
      } catch (error) {
        processedSourceCount += 1;
        errors.push({ filePath, error: error?.message ?? String(error) });
        this.health.recordIngestError({ sourcePath: filePath, source, error, parserVersion: this.parserVersion });
      }
      await this.yieldControl();
    }

    const pending = this.health.summarizePending(sources, { parserVersion: this.parserVersion });
    const finished = this.health.finishGeneration({ generation, ...pending, success: scan.complete && errors.length === 0 });
    return {
      generation,
      scannedSourceCount: sources.length,
      suppressedSourceCount: suppressions.size,
      sourceScanComplete: scan.complete,
      sourceScanLimited: scan.limited,
      sourceScanErrors: scan.errors,
      processedSourceCount,
      bytesRead,
      pendingFileCount: pending.pendingFileCount,
      pendingByteCount: pending.pendingByteCount,
      queueDepth: this.queueDepth,
      results,
      errors,
      health: finished.health
    };
  }
}
