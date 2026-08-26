import fs from 'node:fs';
import { parseRolloutObject } from '../parsers/rollout-event.js';
import { timelineCategoryForTool } from './timeline.js';

export const DEFAULT_ACTIVITY_PREVIEW_BYTES = 512 * 1024;
export const DEFAULT_ACTIVITY_PREVIEW_EVENTS = 128;
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

function createAccumulator() {
  return {
    remainder: '',
    activeTools: new Map(),
    currentTurnStartedAtMs: null
  };
}

function pushPreview(entries, entry, limit) {
  if (!entry) return;
  entries.push(entry);
  while (entries.length > limit) entries.shift();
}

function recordPreviewEvent(entries, state, event, limit) {
  if (!event || event.kind === 'usage' || event.kind === 'quota' || event.kind === 'unknown') return;
  const atMs = finiteOrNull(event.atMs);

  if (event.kind === 'message') {
    pushPreview(entries, {
      atMs,
      category: event.role === 'user' ? 'user' : 'assistant',
      group: 'message',
      label: previewLabel(event, event.role ?? 'message')
    }, limit);
  } else if (event.kind === 'turn-start') {
    state.currentTurnStartedAtMs = atMs;
    pushPreview(entries, { atMs, category: 'turn', group: 'turn', label: 'Turn started' }, limit);
  } else if (event.kind === 'turn-complete') {
    const durationMs = atMs != null && state.currentTurnStartedAtMs != null && atMs >= state.currentTurnStartedAtMs
      ? atMs - state.currentTurnStartedAtMs
      : null;
    pushPreview(entries, {
      atMs,
      category: event.error ? 'error' : 'turn',
      group: 'turn',
      label: event.error ? `Turn failed: ${event.error}` : 'Turn completed',
      durationMs,
      failed: Boolean(event.error)
    }, limit);
    state.currentTurnStartedAtMs = null;
  } else if (event.kind === 'tool-start') {
    const group = timelineCategoryForTool(event.tool, event.rawType);
    if (event.callId) state.activeTools.set(event.callId, { ...event, group });
    pushPreview(entries, {
      atMs,
      category: group,
      group,
      label: previewLabel(event, event.tool ?? 'tool'),
      tool: event.tool ?? null
    }, limit);
  } else if (event.kind === 'tool-end') {
    const start = event.callId ? state.activeTools.get(event.callId) : null;
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
    if (event.callId) state.activeTools.delete(event.callId);
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

function consumePreviewText(entries, state, text, {
  dropLeadingPartial = false,
  limit = DEFAULT_ACTIVITY_PREVIEW_EVENTS
} = {}) {
  let source = String(text ?? '');
  if (dropLeadingPartial) {
    const newline = source.indexOf('\n');
    if (newline < 0) return entries;
    source = source.slice(newline + 1);
    state.remainder = '';
  }

  const combined = `${state.remainder}${source}`;
  const lines = combined.split(/\r?\n/);
  state.remainder = lines.pop() ?? '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      recordPreviewEvent(entries, state, parseRolloutObject(JSON.parse(line)), limit);
    } catch {}
  }
  return entries;
}

function previewEventsFromText(text, { dropLeadingPartial = false, limit = DEFAULT_ACTIVITY_PREVIEW_EVENTS } = {}) {
  const entries = [];
  consumePreviewText(entries, createAccumulator(), text, { dropLeadingPartial, limit });
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
    this.maxEvents = Math.max(8, Number(maxEvents) || DEFAULT_ACTIVITY_PREVIEW_EVENTS);
    this.refreshIntervalMs = Math.max(250, Number(refreshIntervalMs) || DEFAULT_ACTIVITY_PREVIEW_REFRESH_MS);
    this.cached = null;
    this.cachedAtMs = Number.NEGATIVE_INFINITY;
    this.state = createAccumulator();
  }

  clear() {
    this.cached = null;
    this.cachedAtMs = Number.NEGATIVE_INFINITY;
    this.state = createAccumulator();
  }

  metadata(row, size, extras = {}) {
    return {
      id: row.id,
      project: row.project ?? 'UNKNOWN',
      session: row.threadId ?? row.name ?? row.id,
      sizeBytes: size,
      offset: size,
      sourceBytes: extras.sourceBytes ?? 0,
      lastReadBytes: extras.lastReadBytes ?? 0,
      truncated: extras.truncated ?? false,
      gap: extras.gap ?? false,
      events: extras.events ?? [],
      error: extras.error ?? null
    };
  }

  readSegment(filePath, start, length) {
    const fd = this.fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const read = this.fs.readSync(fd, buffer, 0, length, start);
      return { text: buffer.subarray(0, read).toString('utf8'), read };
    } finally {
      this.fs.closeSync(fd);
    }
  }

  initialize(row, size) {
    this.state = createAccumulator();
    if (size == null || size <= 0) {
      this.cached = this.metadata(row, size, {
        events: [],
        error: size == null ? 'preview unavailable' : null
      });
      return this.cached;
    }

    const length = Math.min(size, this.maxBytes);
    const start = Math.max(0, size - length);
    try {
      const { text, read } = this.readSegment(row.filePath, start, length);
      const events = [];
      consumePreviewText(events, this.state, text, {
        dropLeadingPartial: start > 0,
        limit: this.maxEvents
      });
      this.cached = this.metadata(row, size, {
        sourceBytes: read,
        lastReadBytes: read,
        truncated: start > 0,
        events
      });
    } catch (error) {
      this.cached = this.metadata(row, size, {
        events: [],
        error: error?.message ?? 'preview read failed'
      });
    }
    return this.cached;
  }

  append(row, size) {
    const previousOffset = finiteOrNull(this.cached?.offset) ?? finiteOrNull(this.cached?.sizeBytes) ?? 0;
    if (size <= previousOffset) return this.cached;

    let start = previousOffset;
    let length = size - previousOffset;
    let gap = false;
    let dropLeadingPartial = false;
    if (length > this.maxBytes) {
      start = Math.max(previousOffset, size - this.maxBytes);
      length = size - start;
      gap = start > previousOffset;
      dropLeadingPartial = gap;
      if (gap) {
        this.state.remainder = '';
        this.state.activeTools.clear();
        this.state.currentTurnStartedAtMs = null;
      }
    }

    try {
      const { text, read } = this.readSegment(row.filePath, start, length);
      const events = Array.isArray(this.cached?.events) ? this.cached.events : [];
      consumePreviewText(events, this.state, text, {
        dropLeadingPartial,
        limit: this.maxEvents
      });
      this.cached = this.metadata(row, size, {
        sourceBytes: (finiteOrNull(this.cached?.sourceBytes) ?? 0) + read,
        lastReadBytes: read,
        truncated: Boolean(this.cached?.truncated || gap),
        gap: Boolean(this.cached?.gap || gap),
        events
      });
    } catch (error) {
      this.cached = {
        ...this.cached,
        sizeBytes: size,
        offset: size,
        error: error?.message ?? 'preview append failed'
      };
    }
    return this.cached;
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
    if (!sameSession) {
      const result = this.initialize(row, size);
      this.cachedAtMs = now;
      return result;
    }

    const cachedSize = finiteOrNull(this.cached?.sizeBytes);
    if (cachedSize === size) return this.cached;
    if (now - this.cachedAtMs < this.refreshIntervalMs) return this.cached;

    let result;
    if (size == null) {
      result = { ...this.cached, error: 'preview unavailable' };
    } else if (cachedSize != null && size > cachedSize) {
      result = this.append(row, size);
    } else {
      result = this.initialize(row, size);
    }
    this.cachedAtMs = now;
    return result;
  }
}

export { previewEventsFromText, consumePreviewText };
