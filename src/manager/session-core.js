import fs from 'node:fs';
import path from 'node:path';
import { HistoryEngine } from '../history/engine.js';
import { parseRolloutObject } from '../parsers/rollout-event.js';
import { samePlatformPath } from '../platform/common.js';
import { createSelectedSessionDetail } from './detail-view.js';
import { LightweightSessionSummaries } from './lightweight-summary.js';
import { buildManagerProcessEvidence } from './process-evidence.js';

export const SESSION_ACTIVITY = Object.freeze({
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  UNKNOWN: 'UNKNOWN'
});

const DEFAULT_IDENTITY_BYTES = 64 * 1024;

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

export function probeSessionIdentity(filePath, fsRef = fs, maxBytes = DEFAULT_IDENTITY_BYTES) {
  let fd = null;
  try {
    fd = fsRef.openSync(filePath, 'r');
    const stat = fsRef.fstatSync(fd);
    const length = Math.min(Math.max(0, Number(maxBytes) || 0), stat.size);
    if (length <= 0) return null;
    const buffer = Buffer.alloc(length);
    fsRef.readSync(fd, buffer, 0, length, 0);
    let identity = null;
    for (const raw of buffer.toString('utf8').split(/\r?\n/)) {
      if (!raw.trim()) continue;
      try {
        const event = parseRolloutObject(JSON.parse(raw));
        if (!event) continue;
        if (event.kind === 'session-meta') {
          identity = {
            threadId: event.threadId ?? null,
            cwd: event.cwd ?? null,
            project: event.cwd ? path.basename(path.resolve(event.cwd)) : null,
            model: event.model ?? null,
            startedAtMs: event.atMs ?? null
          };
          if (identity.threadId && identity.cwd && identity.model) break;
        } else if (identity && event.kind === 'model-settings' && event.model) {
          identity.model = event.model;
        }
      } catch {}
    }
    return identity;
  } catch {
    return null;
  } finally {
    if (fd != null) try { fsRef.closeSync(fd); } catch {}
  }
}

function metadata(filePath, fsRef = fs, { enrichIdentity = false, identityBytes = DEFAULT_IDENTITY_BYTES } = {}) {
  try {
    const stat = fsRef.statSync(filePath);
    const identity = enrichIdentity ? probeSessionIdentity(filePath, fsRef, identityBytes) : null;
    return {
      id: filePath,
      filePath,
      name: path.basename(filePath, path.extname(filePath)),
      sizeBytes: stat.size,
      createdAtMs: stat.birthtimeMs || stat.ctimeMs || null,
      modifiedAtMs: stat.mtimeMs || null,
      state: SESSION_ACTIVITY.UNKNOWN,
      project: identity?.project ?? null,
      cwd: identity?.cwd ?? null,
      threadId: identity?.threadId ?? null,
      model: identity?.model ?? null,
      startedAtMs: identity?.startedAtMs ?? null,
      lastActivityAtMs: stat.mtimeMs || null,
      parsed: false,
      identityProbed: Boolean(identity),
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
      startedAtMs: null,
      lastActivityAtMs: null,
      parsed: false,
      identityProbed: false,
      error: error?.message ?? 'stat failed'
    };
  }
}

function mergeMetadata(old, fresh) {
  if (!old) return fresh;
  return {
    ...old,
    ...fresh,
    parsed: old.parsed,
    project: fresh.project ?? old.project,
    cwd: fresh.cwd ?? old.cwd,
    threadId: fresh.threadId ?? old.threadId,
    model: fresh.model ?? old.model,
    startedAtMs: fresh.startedAtMs ?? old.startedAtMs,
    identityProbed: old.identityProbed || fresh.identityProbed
  };
}

export function buildProcessEvidence(processes, options = {}) {
  return buildManagerProcessEvidence(processes, options);
}

export class SessionActivityResolver {
  constructor({ now = () => Date.now(), staleAfterMs = 15_000 } = {}) {
    this.now = now;
    this.staleAfterMs = staleAfterMs;
    this.observed = new Map();
  }

  resolve(session, evidence = {}) {
    const nowMs = this.now();
    const previous = this.observed.get(session.id);
    const size = Number(session.sizeBytes);
    const modifiedAtMs = Number(session.modifiedAtMs);
    const grew = Boolean(previous && Number.isFinite(size) && Number.isFinite(previous.sizeBytes) && size > previous.sizeBytes);
    const processMatch = evidence.processMatch === true;
    const processKnown = evidence.processKnown === true;
    const strongLive = processMatch || grew;
    const lastStrongAtMs = strongLive ? nowMs : previous?.lastStrongAtMs ?? null;

    let state = SESSION_ACTIVITY.UNKNOWN;
    if (strongLive) {
      state = SESSION_ACTIVITY.LIVE;
    } else if (previous?.state === SESSION_ACTIVITY.LIVE
      && Number.isFinite(lastStrongAtMs)
      && nowMs - lastStrongAtMs < this.staleAfterMs
      && !(processKnown && !processMatch)) {
      state = SESSION_ACTIVITY.LIVE;
    } else if (processKnown && !processMatch) {
      const age = Number.isFinite(modifiedAtMs) ? Math.max(0, nowMs - modifiedAtMs) : Number.POSITIVE_INFINITY;
      if (age >= this.staleAfterMs) state = SESSION_ACTIVITY.ENDED;
    }

    this.observed.set(session.id, {
      sizeBytes: Number.isFinite(size) ? size : null,
      modifiedAtMs: Number.isFinite(modifiedAtMs) ? modifiedAtMs : null,
      lastStrongAtMs,
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
  constructor({
    sessionsPath,
    fsRef = fs,
    activityResolver = null,
    now = () => Date.now(),
    identityBytes = DEFAULT_IDENTITY_BYTES,
    summaries = null
  } = {}) {
    this.sessionsPath = sessionsPath;
    this.fs = fsRef;
    this.now = now;
    this.identityBytes = identityBytes;
    this.activity = activityResolver ?? new SessionActivityResolver({ now });
    this.summaries = summaries ?? new LightweightSessionSummaries({ fsRef });
    this.index = [];
    this.selectedId = null;
    this.deep = new HistoryEngine({ sessionsPath, fsRef });
  }

  discover({ limit = Number.POSITIVE_INFINITY, enrichIdentity = true, processEvidence = null } = {}) {
    const previous = new Map(this.index.map((item) => [item.filePath, item]));
    const next = [];
    for (const filePath of walkJsonl(this.sessionsPath, this.fs, limit)) {
      const old = previous.get(filePath);
      const fresh = metadata(filePath, this.fs, {
        enrichIdentity: enrichIdentity && !old?.identityProbed,
        identityBytes: this.identityBytes
      });
      const item = mergeMetadata(old, fresh);
      const evidence = typeof processEvidence === 'function' ? (processEvidence(item) ?? {}) : {};
      item.state = this.activity.resolve(item, evidence);
      next.push(item);
    }
    const existing = new Set(next.map((item) => item.id));
    for (const old of this.index) {
      if (!existing.has(old.id)) {
        this.activity.forget(old.id);
        this.summaries.forget(old.id);
      }
    }
    this.index = next.sort((a, b) => (b.modifiedAtMs ?? 0) - (a.modifiedAtMs ?? 0));
    if (this.selectedId && !existing.has(this.selectedId)) this.releaseSelection();
    return this.index;
  }

  refreshKnown({ processEvidence = null } = {}) {
    const next = [];
    for (const old of this.index) {
      const fresh = metadata(old.filePath, this.fs, {
        enrichIdentity: !old.identityProbed,
        identityBytes: this.identityBytes
      });
      if (fresh.error) {
        this.activity.forget(old.id);
        this.summaries.forget(old.id);
        if (this.selectedId === old.id) this.releaseSelection();
        continue;
      }
      const item = mergeMetadata(old, fresh);
      const evidence = typeof processEvidence === 'function' ? (processEvidence(item) ?? {}) : {};
      item.state = this.activity.resolve(item, evidence);
      next.push(item);
    }
    this.index = next.sort((a, b) => (b.modifiedAtMs ?? 0) - (a.modifiedAtMs ?? 0));
    return this.index;
  }

  refresh(options = {}) {
    return this.discover({ ...options, enrichIdentity: true });
  }

  query(options = {}) { return querySessions([...this.index], options); }

  bootstrapRecentSummaries(limit = 8) {
    const bounded = Math.max(0, Number(limit) || 0);
    this.index.slice(0, bounded).forEach((item) => this.summaries.ensure(item, { bootstrap: true }));
    this.index.slice(bounded).forEach((item) => this.summaries.ensure(item, { bootstrap: false }));
    return this.rows();
  }

  tailSummaries() {
    for (const item of this.index) this.summaries.tail(item);
    return this.rows();
  }

  rows() {
    const nowMs = this.now();
    return this.index.map((item) => this.summaries.row(item, { nowMs }));
  }

  select(id) {
    const meta = this.index.find((item) => item.id === id);
    if (!meta) return null;
    if (this.selectedId && this.selectedId !== id) this.deep.cache.delete(this.selectedId);
    this.selectedId = id;
    const model = this.deep.ensureLoaded(id);
    meta.parsed = true;
    meta.threadId = model.info.threadId;
    meta.cwd = model.info.cwd;
    meta.project = model.info.cwd ? path.basename(path.resolve(model.info.cwd)) : null;
    meta.model = model.info.model;
    meta.lastActivityAtMs = model.info.lastEventAtMs ?? meta.modifiedAtMs;
    this.summaries.adoptDeepModel(meta, model);
    return model;
  }

  releaseSelection() {
    const id = this.selectedId;
    this.selectedId = null;
    if (id) this.deep.cache.delete(id);
    return id;
  }

  clearSelection() { return this.releaseSelection(); }

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
      this.summaries.adoptDeepModel(meta, result.model);
    }
    return result;
  }

  selectedModel() { return this.selectedId ? this.deep.cache.get(this.selectedId) ?? null : null; }

  selectedDetail() {
    if (!this.selectedId) return null;
    const meta = this.index.find((item) => item.id === this.selectedId);
    const model = this.selectedModel();
    return createSelectedSessionDetail(meta, model);
  }

  sessionMatchesCwd(item, cwd, platform) {
    return Boolean(item?.cwd && cwd && samePlatformPath(item.cwd, cwd, platform));
  }
}

export { walkJsonl as discoverSessionFiles, metadata as sessionFileMetadata, DEFAULT_IDENTITY_BYTES };
