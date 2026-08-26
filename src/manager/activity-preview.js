import fs from 'node:fs';
import { parseRolloutObject } from '../parsers/rollout-event.js';
import { timelineCategoryForTool } from './timeline.js';

export const DEFAULT_ACTIVITY_PREVIEW_BYTES = 128 * 1024;
export const DEFAULT_ACTIVITY_PREVIEW_EVENTS = 18;
export const DEFAULT_ACTIVITY_PREVIEW_REFRESH_MS = 1000;

function finiteOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function previewLabel(event, fallback = 'event') {
  return String(
    event?.command
      ?? event?.path
      ?? event?.query
      ?? event?.detail
      ?? event?.tool
      ?? event?.model
      ?? event?.turnId
      ?? fallback
  ).trim() || fallback;
}

function pushPreview(entries, entry, limit) {
  if (!entry) return;
  entries.push(entry);
  while (entries.length > limit) entries.shift();
}

function previewEventsFromText(text, { dropLeadingPartial = false, limit = DEFAULT_ACTIVITY_PREVIEW_EVENTS } = {}) {
  let source = String(text ?? '');
  if (dropLeadingPartial) {
    const newline = source.indexOf('\n');
    if (newline < 0) return [];
    source = source.slice(newline + 1);
  }

  const entries = [];
  const activeTools = new Map();
  let currentTurnStartedAtMs = null;

  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = parseRolloutObject(JSON.parse(line));
    } catch {
      continue;
    }
    if (!event || event.kind === 'usage' || event.kind === 'quota' || event.kind === 'unknown') continue;
    const atMs = finiteOrNull(event.atMs);

    if (event.kind === 'message') {
      pushPreview(entries, {
        atMs,
        category: event.role === 'user' ? 'user' : 'assistant',
        group: 'message',
        label: previewLabel(event, event.role ?? 'message')
      }, limit);
    } else if (event.kind === 'turn-start') {
      currentTurnStartedAtMs = atMs;
      pushPreview(entries, { atMs, category: 'turn', group: 'turn', label: 'Turn started' }, limit);
    } else if (event.kind === 'turn-complete') {
      const durationMs = atMs != null && currentTurnStartedAtMs != null && atMs >= currentTurnStartedAtMs
        ? atMs - currentTurnStartedAtMs
        : null;
      pushPreview(entries, {
        atMs,
        category: event.error ? 'error' : 'turn',
        group: 'turn',
        label: event.error ? `Turn failed: ${event.error}` : 'Turn completed',
        durationMs,
        failed: Boolean(event.error)
      }, limit);
      currentTurnStartedAtMs = null;
    } else if (event.kind === 'tool-start') {
      const group = timelineCategoryForTool(event.tool, event.rawType);
      if (event.callId) activeTools.set(event.callId, { ...event, group });
      pushPreview(entries, {
        atMs,
        category: group,
        group,
        label: previewLabel(event, event.tool ?? 'tool'),
        tool: event.tool ?? null
      }, limit);
    } else if (event.kind === 'tool-end') {
      const start = event.callId ? activeTools.get(event.callId) : null;
      const group = start?.group ?? 'tool';
      const durationMs = finiteOrNull(event.durationMs)
        ?? (atMs != null && finiteOrNull(start?.atMs) != null && atMs >= start.atMs ? atMs - start.atMs : null);
      const exitCode = finiteOrNull(event.exitCode);
      const failed = (exitCode != null && exitCode !== 0)
        || lower(event.status).includes('fail')
        || lower(event.status).includes('error');
      pushPreview(entries, {
        atMs,
        category: failed ? 'error' : 'result',
        group,
        label: failed ? `${start?.tool ?? 'tool'} failed` : `${start?.tool ?? 'tool'} result`,
        tool: start?.tool ?? null,
        durationMs,
        failed
      }, limit);
      if (event.callId) activeTools.delete(event.callId);
    } else if (event.kind === 'approval') {
      pushPreview(entries, { atMs, category: 'approval', group: 'approval', label: previewLabel(event, 'Approval requested') }, limit);
    } else if (event.kind === 'retry') {
      pushPreview(entries, { atMs, category: 'retry', group: 'error', label: previewLabel(event, 'Retry') }, limit);
    } else if (event.kind === 'error') {
      pushPreview(entries, { atMs, category: 'error', group: 'error', label: previewLabel(event, 'Error'), failed: true }, limit);
    } else if (event.kind === 'compaction') {
      pushPreview(entries, { atMs, category: 'compaction', group: 'event', label: 'Context compacted' }, limit);
    } else if (event.kind === 'actual-model') {
      pushPreview(entries, { atMs, category: 'model', group: 'event', label: `Model reroute -> ${event.model ?? '--'}` }, limit);
    }
  }

  return entries;
}

export class SelectedActivityPreview {
  constructor({
    fsRef = fs,
    maxBytes = DEFAULT_ACTIVITY_PREVIEW_BYTES,
    maxEvents = DEFAULT_ACTIVITY_PREVIEW_EVENTS,
    refreshIntervalMs = DEFAULT_ACTIVITY_PREVIEW_REFRESH_MS
  } = {}) {
    this.fs = fsRef;
    this.maxBytes = Math.max(16 * 1024, Number(maxBytes) || DEFAULT_ACTIVITY_PREVIEW_BYTES);
    this.maxEvents = Math.max(4, Number(maxEvents) || DEFAULT_ACTIVITY_PREVIEW_EVENTS);
    this.refreshIntervalMs = Math.max(250, Number(refreshIntervalMs) || DEFAULT_ACTIVITY_PREVIEW_REFRESH_MS);
    this.cached = null;
    this.cachedAtMs = Number.NEGATIVE_INFINITY;
  }

  clear() {
    this.cached = null;
    this.cachedAtMs = Number.NEGATIVE_INFINITY;
  }

  read(row, { nowMs = Date.now() } = {}) {
    if (!row?.id || !row?.filePath) {
      this.clear();
      return null;
    }

    const now = finiteOrNull(nowMs) ?? Date.now();
    let size = finiteOrNull(row.fileSizeBytes);
    if (size == null) {
      try { size = this.fs.statSync(row.filePath).size; } catch { size = null; }
    }

    const sameSession = this.cached?.id === row.id;
    const sameSize = sameSession && this.cached?.sizeBytes === size;
    if (sameSize) return this.cached;
    if (sameSession && now - this.cachedAtMs < this.refreshIntervalMs) return this.cached;

    if (size == null || size <= 0) {
      this.cached = {
        id: row.id,
        project: row.project ?? 'UNKNOWN',
        session: row.threadId ?? row.name ?? row.id,
        sizeBytes: size,
        sourceBytes: 0,
        truncated: false,
        events: [],
        error: size == null ? 'preview unavailable' : null
      };
      this.cachedAtMs = now;
      return this.cached;
    }

    const length = Math.min(size, this.maxBytes);
    const start = Math.max(0, size - length);
    let fd = null;
    try {
      fd = this.fs.openSync(row.filePath, 'r');
      const buffer = Buffer.alloc(length);
      const read = this.fs.readSync(fd, buffer, 0, length, start);
      const text = buffer.subarray(0, read).toString('utf8');
      this.cached = {
        id: row.id,
        project: row.project ?? 'UNKNOWN',
        session: row.threadId ?? row.name ?? row.id,
        sizeBytes: size,
        sourceBytes: read,
        truncated: start > 0,
        events: previewEventsFromText(text, {
          dropLeadingPartial: start > 0,
          limit: this.maxEvents
        }),
        error: null
      };
    } catch (error) {
      this.cached = {
        id: row.id,
        project: row.project ?? 'UNKNOWN',
        session: row.threadId ?? row.name ?? row.id,
        sizeBytes: size,
        sourceBytes: 0,
        truncated: start > 0,
        events: [],
        error: error?.message ?? 'preview read failed'
      };
    } finally {
      if (fd != null) try { this.fs.closeSync(fd); } catch {}
    }
    this.cachedAtMs = now;
    return this.cached;
  }
}

export { previewEventsFromText };
