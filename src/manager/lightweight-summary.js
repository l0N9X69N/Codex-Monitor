import fs from 'node:fs';
import { parseRolloutObject } from '../parsers/rollout-event.js';

export const DEFAULT_LIGHTWEIGHT_BOOTSTRAP_BYTES = 128 * 1024;
export const DEFAULT_LIGHTWEIGHT_INCREMENT_BYTES = 256 * 1024;
export const DEFAULT_LIGHTWEIGHT_RECENT_LIMIT = 8;

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isAgentSpawnTool(name) {
  const clean = String(name ?? '').trim().toLowerCase();
  if (!clean) return false;
  const leaf = clean.split(/[.:/\\]/).filter(Boolean).at(-1) ?? clean;
  return leaf === 'spawn_agent';
}

function agentSpawnCountFromByName(byName = {}) {
  if (!byName || typeof byName !== 'object') return 0;
  return Object.entries(byName).reduce((sum, [name, count]) => {
    if (!isAgentSpawnTool(name)) return sum;
    return sum + (numberOrNull(count) ?? 0);
  }, 0);
}

function readSegment(filePath, start, length, fsRef = fs) {
  if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0) return '';
  const fd = fsRef.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const read = fsRef.readSync(fd, buffer, 0, length, start);
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    fsRef.closeSync(fd);
  }
}

function freshSummary(item, { countsComplete = false } = {}) {
  return {
    id: item.id,
    filePath: item.filePath,
    offset: numberOrNull(item.sizeBytes) ?? 0,
    remainder: '',
    initialized: false,
    countsComplete,
    observationGap: false,
    startedAtMs: numberOrNull(item.startedAtMs),
    lastEventAtMs: null,
    model: item.model ?? null,
    reasoning: null,
    tokens: {
      input: null,
      cached: null,
      output: null,
      reasoning: null,
      contextWindow: null,
      contextUsed: null
    },
    turnCount: countsComplete ? 0 : null,
    toolCount: countsComplete ? 0 : null,
    agentSpawnCount: countsComplete ? 0 : null,
    observedTurnCount: 0,
    observedToolCount: 0,
    observedAgentSpawnCount: 0,
    recentErrors: [],
    recentRetries: [],
    recentCompactions: [],
    rejectedLines: 0
  };
}

function pushRecent(list, value, limit) {
  list.push(value);
  while (list.length > limit) list.shift();
}

function applyEvent(summary, event, recentLimit) {
  if (!event) return;
  const atMs = numberOrNull(event.atMs);
  if (atMs != null) summary.lastEventAtMs = Math.max(summary.lastEventAtMs ?? 0, atMs);

  if (event.kind === 'session-meta') {
    if (atMs != null && summary.startedAtMs == null) summary.startedAtMs = atMs;
    if (event.model) summary.model = event.model;
    if (event.reasoning) summary.reasoning = event.reasoning;
  } else if (event.kind === 'model-settings') {
    if (event.model) summary.model = event.model;
    if (event.reasoning) summary.reasoning = event.reasoning;
  } else if (event.kind === 'usage') {
    if (event.inputTokens != null) summary.tokens.input = event.inputTokens;
    if (event.cachedInputTokens != null) summary.tokens.cached = event.cachedInputTokens;
    if (event.outputTokens != null) summary.tokens.output = event.outputTokens;
    if (event.reasoningTokens != null) summary.tokens.reasoning = event.reasoningTokens;
    if (event.contextWindow != null) summary.tokens.contextWindow = event.contextWindow;
    if (event.contextUsed != null) summary.tokens.contextUsed = event.contextUsed;
  } else if (event.kind === 'turn-start') {
    summary.observedTurnCount += 1;
    if (summary.countsComplete) summary.turnCount = (summary.turnCount ?? 0) + 1;
  } else if (event.kind === 'tool-start') {
    summary.observedToolCount += 1;
    if (summary.countsComplete) summary.toolCount = (summary.toolCount ?? 0) + 1;
    if (isAgentSpawnTool(event.tool)) {
      summary.observedAgentSpawnCount += 1;
      if (summary.countsComplete) summary.agentSpawnCount = (summary.agentSpawnCount ?? 0) + 1;
    }
  } else if (event.kind === 'error') {
    pushRecent(summary.recentErrors, { atMs, detail: event.detail ?? null }, recentLimit);
  } else if (event.kind === 'retry') {
    pushRecent(summary.recentRetries, { atMs, detail: event.detail ?? null }, recentLimit);
  } else if (event.kind === 'compaction') {
    pushRecent(summary.recentCompactions, { atMs }, recentLimit);
  }
}

function consumeChunk(summary, text, { dropLeadingPartial = false, recentLimit = DEFAULT_LIGHTWEIGHT_RECENT_LIMIT } = {}) {
  let chunk = String(text ?? '');
  if (dropLeadingPartial) {
    const newline = chunk.indexOf('\n');
    if (newline < 0) {
      summary.remainder = '';
      return summary;
    }
    chunk = chunk.slice(newline + 1);
  }

  const combined = `${summary.remainder}${chunk}`;
  const lines = combined.split(/\r?\n/);
  summary.remainder = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      applyEvent(summary, parseRolloutObject(JSON.parse(line)), recentLimit);
    } catch {
      summary.rejectedLines += 1;
    }
  }
  return summary;
}

export class LightweightSessionSummaries {
  constructor({
    fsRef = fs,
    maxBootstrapBytes = DEFAULT_LIGHTWEIGHT_BOOTSTRAP_BYTES,
    maxIncrementBytes = DEFAULT_LIGHTWEIGHT_INCREMENT_BYTES,
    recentLimit = DEFAULT_LIGHTWEIGHT_RECENT_LIMIT
  } = {}) {
    this.fs = fsRef;
    this.maxBootstrapBytes = maxBootstrapBytes;
    this.maxIncrementBytes = maxIncrementBytes;
    this.recentLimit = recentLimit;
    this.cache = new Map();
  }

  has(id) { return this.cache.has(id); }
  get(id) { return this.cache.get(id) ?? null; }
  forget(id) { this.cache.delete(id); }

  observe(item) {
    const existing = this.cache.get(item.id);
    if (existing) return existing;
    const summary = freshSummary(item, { countsComplete: false });
    summary.initialized = true;
    this.cache.set(item.id, summary);
    return summary;
  }

  bootstrap(item) {
    const size = numberOrNull(item.sizeBytes) ?? 0;
    const length = Math.min(size, this.maxBootstrapBytes);
    const start = Math.max(0, size - length);
    const summary = freshSummary(item, { countsComplete: start === 0 });
    summary.offset = size;
    summary.initialized = true;
    try {
      const text = readSegment(item.filePath, start, length, this.fs);
      consumeChunk(summary, text, { dropLeadingPartial: start > 0, recentLimit: this.recentLimit });
    } catch {
      summary.countsComplete = false;
      summary.turnCount = null;
      summary.toolCount = null;
      summary.agentSpawnCount = null;
    }
    this.cache.set(item.id, summary);
    return summary;
  }

  ensure(item, { bootstrap = false } = {}) {
    return this.cache.get(item.id) ?? (bootstrap ? this.bootstrap(item) : this.observe(item));
  }

  tail(item) {
    let summary = this.ensure(item);
    const size = numberOrNull(item.sizeBytes);
    if (size == null) return { changed: false, reset: false, summary };

    if (size < summary.offset) {
      summary = this.bootstrap(item);
      return { changed: true, reset: true, summary };
    }
    if (size === summary.offset) return { changed: false, reset: false, summary };

    let start = summary.offset;
    let length = size - summary.offset;
    let dropLeadingPartial = false;
    if (length > this.maxIncrementBytes) {
      start = Math.max(0, size - this.maxIncrementBytes);
      length = size - start;
      summary.remainder = '';
      summary.countsComplete = false;
      summary.turnCount = null;
      summary.toolCount = null;
      summary.agentSpawnCount = null;
      summary.observationGap = true;
      dropLeadingPartial = start > 0;
    }

    try {
      const text = readSegment(item.filePath, start, length, this.fs);
      consumeChunk(summary, text, { dropLeadingPartial, recentLimit: this.recentLimit });
      summary.offset = size;
      return { changed: true, reset: false, summary };
    } catch {
      return { changed: false, reset: false, summary };
    }
  }

  adoptDeepModel(item, model) {
    if (!item || !model) return null;
    const summary = this.ensure(item);
    summary.offset = numberOrNull(item.sizeBytes) ?? summary.offset;
    summary.remainder = '';
    summary.countsComplete = true;
    summary.observationGap = false;
    summary.startedAtMs = numberOrNull(model.info?.startedAtMs) ?? summary.startedAtMs;
    summary.lastEventAtMs = numberOrNull(model.info?.lastEventAtMs) ?? summary.lastEventAtMs;
    summary.model = model.info?.model ?? summary.model;
    summary.reasoning = model.info?.reasoning ?? summary.reasoning;
    summary.tokens.input = numberOrNull(model.tokens?.input);
    summary.tokens.cached = numberOrNull(model.tokens?.cached);
    summary.tokens.output = numberOrNull(model.tokens?.output);
    summary.tokens.reasoning = numberOrNull(model.tokens?.reasoning);
    summary.tokens.contextWindow = numberOrNull(model.tokens?.contextWindow);
    summary.tokens.contextUsed = numberOrNull(model.tokens?.contextUsed);
    summary.turnCount = numberOrNull(model.turns?.count) ?? 0;
    summary.toolCount = numberOrNull(model.tools?.count) ?? 0;
    summary.agentSpawnCount = agentSpawnCountFromByName(model.tools?.byName);
    summary.observedTurnCount = summary.turnCount;
    summary.observedToolCount = summary.toolCount;
    summary.observedAgentSpawnCount = summary.agentSpawnCount;
    if (Array.isArray(model.errors)) {
      summary.recentErrors = model.errors.slice(-this.recentLimit).map((entry) => ({
        atMs: numberOrNull(entry?.atMs),
        detail: entry?.detail ?? null
      }));
    }
    return summary;
  }

  row(item, { nowMs = Date.now() } = {}) {
    const summary = this.cache.get(item.id) ?? null;
    const startedAtMs = summary?.startedAtMs ?? numberOrNull(item.startedAtMs);
    const eventLastActivityAtMs = summary?.lastEventAtMs ?? null;
    const fileActivityAtMs = numberOrNull(item.modifiedAtMs);
    const lastActivityAtMs = eventLastActivityAtMs ?? fileActivityAtMs;
    let elapsedMs = null;
    if (startedAtMs != null) {
      if (item.state === 'LIVE') elapsedMs = Math.max(0, nowMs - startedAtMs);
      else if (eventLastActivityAtMs != null && eventLastActivityAtMs >= startedAtMs) elapsedMs = eventLastActivityAtMs - startedAtMs;
    }

    return {
      id: item.id,
      filePath: item.filePath,
      name: item.name,
      state: item.state,
      threadId: item.threadId ?? null,
      project: item.project ?? null,
      cwd: item.cwd ?? null,
      model: summary?.model ?? item.model ?? null,
      reasoning: summary?.reasoning ?? null,
      startedAtMs,
      elapsedMs,
      tokens: summary ? { ...summary.tokens } : {
        input: null,
        cached: null,
        output: null,
        reasoning: null,
        contextWindow: null,
        contextUsed: null
      },
      turnCount: summary?.turnCount ?? null,
      toolCount: summary?.toolCount ?? null,
      agentSpawnCount: summary?.agentSpawnCount ?? null,
      countsComplete: summary?.countsComplete ?? false,
      observedTurnCount: summary?.observedTurnCount ?? 0,
      observedToolCount: summary?.observedToolCount ?? 0,
      observedAgentSpawnCount: summary?.observedAgentSpawnCount ?? 0,
      lastActivityAtMs,
      lastActivitySource: eventLastActivityAtMs != null ? 'rollout-event' : (fileActivityAtMs != null ? 'file-mtime' : null),
      recentErrors: summary ? [...summary.recentErrors] : [],
      recentRetries: summary ? [...summary.recentRetries] : [],
      recentCompactions: summary ? [...summary.recentCompactions] : [],
      fileSizeBytes: numberOrNull(item.sizeBytes),
      modifiedAtMs: fileActivityAtMs,
      observationGap: summary?.observationGap ?? false
    };
  }
}

export { consumeChunk as consumeLightweightSummaryChunk };
