function finiteOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sessionStartedAt(row) {
  return finiteOrNull(row?.startedAtMs)
    ?? finiteOrNull(row?.createdAtMs)
    ?? finiteOrNull(row?.modifiedAtMs);
}

function sessionNewestAt(row) {
  return finiteOrNull(row?.lastActivityAtMs)
    ?? finiteOrNull(row?.modifiedAtMs)
    ?? finiteOrNull(row?.startedAtMs)
    ?? finiteOrNull(row?.createdAtMs);
}

function ageBucket(atMs, nowMs) {
  const at = finiteOrNull(atMs);
  if (at == null) return 'unknown';
  const age = Math.max(0, nowMs - at);
  const day = 24 * 60 * 60 * 1000;
  if (age < day) return '<24h';
  if (age < 7 * day) return '1-7d';
  if (age < 30 * day) return '8-30d';
  if (age < 90 * day) return '31-90d';
  return '>90d';
}

function rankedEntries(map, limit = Number.POSITIVE_INFINITY) {
  return [...map.entries()]
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes || b.count - a.count || String(a.label).localeCompare(String(b.label)))
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function buildSessionStorageSummary(rows = [], {
  nowMs = Date.now(),
  largestLimit = 8,
  projectLimit = 12
} = {}) {
  const source = Array.isArray(rows) ? rows : [];
  const now = finiteOrNull(nowMs) ?? Date.now();
  let totalBytes = 0;
  let knownSizeCount = 0;
  let oldestAtMs = null;
  let newestAtMs = null;
  const counts = { LIVE: 0, ENDED: 0, UNKNOWN: 0 };
  const byProject = new Map();
  const byAge = new Map(['<24h', '1-7d', '8-30d', '31-90d', '>90d', 'unknown'].map((key) => [key, { count: 0, sizeBytes: 0 }]));
  const largest = [];

  for (const row of source) {
    const state = ['LIVE', 'ENDED'].includes(row?.state) ? row.state : 'UNKNOWN';
    counts[state] += 1;
    const sizeBytes = finiteOrNull(row?.fileSizeBytes ?? row?.sizeBytes);
    if (sizeBytes != null && sizeBytes >= 0) {
      totalBytes += sizeBytes;
      knownSizeCount += 1;
    }

    const startedAtMs = sessionStartedAt(row);
    const newest = sessionNewestAt(row);
    if (startedAtMs != null) oldestAtMs = oldestAtMs == null ? startedAtMs : Math.min(oldestAtMs, startedAtMs);
    if (newest != null) newestAtMs = newestAtMs == null ? newest : Math.max(newestAtMs, newest);

    const project = String(row?.project ?? 'UNKNOWN').trim() || 'UNKNOWN';
    const projectEntry = byProject.get(project) ?? { count: 0, sizeBytes: 0 };
    projectEntry.count += 1;
    if (sizeBytes != null && sizeBytes >= 0) projectEntry.sizeBytes += sizeBytes;
    byProject.set(project, projectEntry);

    const bucket = ageBucket(newest ?? startedAtMs, now);
    const ageEntry = byAge.get(bucket) ?? { count: 0, sizeBytes: 0 };
    ageEntry.count += 1;
    if (sizeBytes != null && sizeBytes >= 0) ageEntry.sizeBytes += sizeBytes;
    byAge.set(bucket, ageEntry);

    if (sizeBytes != null && sizeBytes >= 0) {
      largest.push({
        id: row?.id ?? null,
        project,
        threadId: row?.threadId ?? row?.name ?? null,
        state,
        sizeBytes,
        lastActivityAtMs: newest
      });
    }
  }

  largest.sort((a, b) => b.sizeBytes - a.sizeBytes || String(a.project).localeCompare(String(b.project)));

  return {
    count: source.length,
    totalBytes,
    knownSizeCount,
    unknownSizeCount: source.length - knownSizeCount,
    live: counts.LIVE,
    ended: counts.ENDED,
    unknown: counts.UNKNOWN,
    eligibleDeleteCount: counts.ENDED,
    oldestAtMs,
    newestAtMs,
    largest: largest.slice(0, Math.max(0, Number(largestLimit) || 0)),
    byProject: rankedEntries(byProject, projectLimit),
    byAge: [...byAge.entries()].map(([label, value]) => ({ label, ...value })),
    computedAtMs: now
  };
}

export function summarizeSelectedSessions(rows = [], selectedIds = []) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(Array.isArray(selectedIds) ? selectedIds : []);
  let count = 0;
  let sizeBytes = 0;
  let knownSizeCount = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!ids.has(row?.id)) continue;
    count += 1;
    const size = finiteOrNull(row?.fileSizeBytes ?? row?.sizeBytes);
    if (size != null && size >= 0) {
      sizeBytes += size;
      knownSizeCount += 1;
    }
  }
  return { count, sizeBytes, knownSizeCount, unknownSizeCount: count - knownSizeCount };
}

export class SessionStorageSummaryCache {
  constructor({ ttlMs = 10_000, now = () => Date.now() } = {}) {
    this.ttlMs = Math.max(250, Number(ttlMs) || 10_000);
    this.now = now;
    this.rowsRef = null;
    this.value = null;
    this.computedAtMs = Number.NEGATIVE_INFINITY;
  }

  get(rows, options = {}) {
    const nowMs = finiteOrNull(options.nowMs) ?? this.now();
    if (this.value && this.rowsRef === rows && nowMs - this.computedAtMs < this.ttlMs) return this.value;
    this.rowsRef = rows;
    this.value = buildSessionStorageSummary(rows, { ...options, nowMs });
    this.computedAtMs = nowMs;
    return this.value;
  }

  invalidate() {
    this.rowsRef = null;
    this.value = null;
    this.computedAtMs = Number.NEGATIVE_INFINITY;
  }
}

export { ageBucket as sessionAgeBucket };
