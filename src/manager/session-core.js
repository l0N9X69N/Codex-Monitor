import fs from 'node:fs';
import path from 'node:path';
import { HistoryEngine } from '../history/engine.js';
import { samePlatformPath } from '../platform/common.js';

export const SESSION_ACTIVITY = Object.freeze({
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  UNKNOWN: 'UNKNOWN'
});

function walkJsonl(root, fsRef = fs, limit = Number.POSITIVE_INFINITY) {
  const found = [];
  if (!root || !fsRef.existsSync(root)) return found;
  const stack = [root];
  while (stack.length && found.length < limit) {
    const current = stack.pop();
    let entries = [];
    try { entries = fsRef.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.jsonl')) found.push(full);
      if (found.length >= limit) break;
    }
  }
  return found;
}

function metadata(filePath, fsRef = fs) {
  try {
    const stat = fsRef.statSync(filePath);
    return {
      id: filePath,
      filePath,
      name: path.basename(filePath, path.extname(filePath)),
      sizeBytes: stat.size,
      createdAtMs: stat.birthtimeMs || stat.ctimeMs || null,
      modifiedAtMs: stat.mtimeMs || null,
      state: SESSION_ACTIVITY.UNKNOWN,
      project: null,
      cwd: null,
      threadId: null,
      model: null,
      lastActivityAtMs: stat.mtimeMs || null,
      parsed: false,
      error: null
    };
  } catch (error) {
    return {
      id: filePath,
      filePath,
      name: path.basename(filePath),
      sizeBytes: null,
      createdAtMs: null,
      modifiedAtMs: null,
      state: SESSION_ACTIVITY.UNKNOWN,
      project: null,
      cwd: null,
      threadId: null,
      model: null,
      lastActivityAtMs: null,
      parsed: false,
      error: error?.message ?? 'stat failed'
    };
  }
}

export class SessionActivityResolver {
  constructor({ now = () => Date.now(), staleAfterMs = 15_000 } = {}) {
    this.now = now;
    this.staleAfterMs = staleAfterMs;
    this.observed = new Map();
  }

  resolve(session, evidence = {}) {
    const previous = this.observed.get(session.id);
    const size = Number(session.sizeBytes);
    const modifiedAtMs = Number(session.modifiedAtMs);
    const grew = Boolean(previous && Number.isFinite(size) && Number.isFinite(previous.sizeBytes) && size > previous.sizeBytes);
    const processMatch = evidence.processMatch === true;
    const processKnown = evidence.processKnown === true;

    let state = SESSION_ACTIVITY.UNKNOWN;
    if (processMatch || grew) {
      state = SESSION_ACTIVITY.LIVE;
    } else if (processKnown && !processMatch) {
      const age = Number.isFinite(modifiedAtMs) ? Math.max(0, this.now() - modifiedAtMs) : Number.POSITIVE_INFINITY;
      if (age >= this.staleAfterMs) state = SESSION_ACTIVITY.ENDED;
    }

    this.observed.set(session.id, {
      sizeBytes: Number.isFinite(size) ? size : null,
      modifiedAtMs: Number.isFinite(modifiedAtMs) ? modifiedAtMs : null,
      state
    });
    return state;
  }

  forget(id) { this.observed.delete(id); }
  clear() { this.observed.clear(); }
}

function matchesSearch(item, search) {
  const q = String(search ?? '').trim().toLowerCase();
  if (!q) return true;
  return [item.project, item.cwd, item.threadId, item.model, item.name]
    .some((value) => String(value ?? '').toLowerCase().includes(q));
}

function compareValues(a, b, direction) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === 'string' || typeof b === 'string'
    ? String(a).localeCompare(String(b))
    : Number(a) - Number(b);
  return direction === 'asc' ? result : -result;
}

export function querySessions(items = [], {
  scope = 'all',
  search = '',
  sortBy = 'modifiedAtMs',
  direction = 'desc'
} = {}) {
  const normalizedScope = String(scope).toLowerCase();
  const filtered = items.filter((item) => {
    if (normalizedScope === 'live' && item.state !== SESSION_ACTIVITY.LIVE) return false;
    if (normalizedScope === 'ended' && item.state !== SESSION_ACTIVITY.ENDED) return false;
    return matchesSearch(item, search);
  });
  return filtered.sort((a, b) => compareValues(a?.[sortBy], b?.[sortBy], direction));
}

export class SessionManagerCore {
  constructor({ sessionsPath, fsRef = fs, activityResolver = null, now = () => Date.now() } = {}) {
    this.sessionsPath = sessionsPath;
    this.fs = fsRef;
    this.now = now;
    this.activity = activityResolver ?? new SessionActivityResolver({ now });
    this.index = [];
    this.selectedId = null;
    this.deep = new HistoryEngine({ sessionsPath, fsRef });
  }

  discover({ limit = Number.POSITIVE_INFINITY } = {}) {
    this.index = walkJsonl(this.sessionsPath, this.fs, limit)
      .map((filePath) => metadata(filePath, this.fs))
      .sort((a, b) => (b.modifiedAtMs ?? 0) - (a.modifiedAtMs ?? 0));
    return this.index;
  }

  refresh({ processEvidence = null } = {}) {
    const byPath = new Map(this.index.map((item) => [item.filePath, item]));
    const next = [];
    for (const filePath of walkJsonl(this.sessionsPath, this.fs)) {
      const fresh = metadata(filePath, this.fs);
      const old = byPath.get(filePath);
      const item = old ? { ...old, ...fresh, parsed: old.parsed } : fresh;
      const evidence = typeof processEvidence === 'function' ? (processEvidence(item) ?? {}) : {};
      item.state = this.activity.resolve(item, evidence);
      next.push(item);
    }
    const existing = new Set(next.map((item) => item.id));
    for (const old of this.index) if (!existing.has(old.id)) this.activity.forget(old.id);
    this.index = next.sort((a, b) => (b.modifiedAtMs ?? 0) - (a.modifiedAtMs ?? 0));
    if (this.selectedId && !existing.has(this.selectedId)) this.selectedId = null;
    return this.index;
  }

  query(options = {}) { return querySessions([...this.index], options); }

  select(id) {
    const meta = this.index.find((item) => item.id === id);
    if (!meta) return null;
    this.selectedId = id;
    const model = this.deep.ensureLoaded(id);
    meta.parsed = true;
    meta.threadId = model.info.threadId;
    meta.cwd = model.info.cwd;
    meta.project = model.info.cwd ? path.basename(path.resolve(model.info.cwd)) : null;
    meta.model = model.info.model;
    meta.lastActivityAtMs = model.info.lastEventAtMs ?? meta.modifiedAtMs;
    return model;
  }

  clearSelection() { this.selectedId = null; }

  tailSelected() {
    if (!this.selectedId) return { changed: false, reset: false, error: null, model: null };
    const result = this.deep.tail(this.selectedId);
    const meta = this.index.find((item) => item.id === this.selectedId);
    if (meta && result.model) {
      meta.threadId = result.model.info.threadId;
      meta.cwd = result.model.info.cwd;
      meta.project = result.model.info.cwd ? path.basename(path.resolve(result.model.info.cwd)) : null;
      meta.model = result.model.info.model;
      meta.lastActivityAtMs = result.model.info.lastEventAtMs ?? meta.modifiedAtMs;
    }
    return result;
  }

  selectedModel() { return this.selectedId ? this.deep.cache.get(this.selectedId) ?? null : null; }

  sessionMatchesCwd(item, cwd, platform) {
    return Boolean(item?.cwd && cwd && samePlatformPath(item.cwd, cwd, platform));
  }
}

export { walkJsonl as discoverSessionFiles, metadata as sessionFileMetadata };
