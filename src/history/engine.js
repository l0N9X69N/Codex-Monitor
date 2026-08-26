import fs from 'node:fs';
import path from 'node:path';
import { createNormalizedMonitorState } from '../core/normalized-state.js';
import { applyNormalizedEvent } from '../core/reducer.js';
import { PROVENANCE } from '../core/provenance.js';
import { parseRolloutObject } from '../parsers/rollout-event.js';
import { sanitizeDetail, sanitizeText } from '../core/sanitize.js';
import { applySessionAnalyticsEvent, createSessionAnalytics } from '../manager/session-analytics.js';

const HISTORY_LOAD_CHUNK_BYTES = 256 * 1024;

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
    return { id: filePath, filePath, name: path.basename(filePath, path.extname(filePath)), sizeBytes: stat.size, createdAtMs: stat.birthtimeMs || stat.ctimeMs || null, modifiedAtMs: stat.mtimeMs || null, parsed: false, error: null };
  } catch (error) {
    return { id: filePath, filePath, name: path.basename(filePath), sizeBytes: null, createdAtMs: null, modifiedAtMs: null, parsed: false, error: error?.message ?? 'stat failed' };
  }
}

function historicalModel(filePath) {
  return {
    id: filePath,
    filePath,
    info: { threadId: null, model: null, reasoning: null, cwd: null, startedAtMs: null, lastEventAtMs: null },
    tokens: { input: null, cached: null, output: null, reasoning: null, contextWindow: null, contextUsed: null },
    turns: { count: 0, completed: 0, lastDurationMs: null },
    tools: { count: 0, byName: {}, recent: [] },
    resources: { evidence: [] },
    errors: [],
    timeline: [],
    analytics: createSessionAnalytics(),
    normalized: createNormalizedMonitorState({ runId: filePath, startedAtMs: 0 }),
    parsedLines: 0,
    rejectedLines: 0,
    offset: 0,
    remainder: '',
    complete: false,
    _activeToolCalls: new Map()
  };
}

function addResourceEvidence(model, kind, value, atMs) {
  const clean = sanitizeText(value, { maxLength: 100 });
  if (!clean) return;
  if (model.resources.evidence.some((item) => item.kind === kind && item.value === clean)) return;
  model.resources.evidence.push({ kind, value: clean, atMs });
  if (model.resources.evidence.length > 100) model.resources.evidence.shift();
}

function lower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isAgentSpawnTool(name) {
  const clean = lower(name);
  if (!clean) return false;
  const leaf = clean.split(/[.:/\\]/).filter(Boolean).at(-1) ?? clean;
  return leaf === 'spawn_agent';
}

function toolGroup(name, rawType = '') {
  const tool = lower(name);
  const type = lower(rawType);
  if (isAgentSpawnTool(tool)) return 'agent';
  if (type.includes('patch_apply') || tool.includes('apply_patch') || tool.includes('read_file') || tool.includes('write_file') || tool.includes('edit_file')) return 'file';
  if (type.includes('exec_command') || type.includes('local_shell') || tool === 'shell' || tool.includes('shell') || tool.includes('exec_command')) return 'shell';
  return 'tool';
}

function timelineLabel(event, fallback = '') {
  return sanitizeText(
    event?.command
      ?? event?.path
      ?? event?.query
      ?? event?.detail
      ?? event?.tool
      ?? event?.model
      ?? event?.turnId
      ?? fallback,
    { maxLength: 500 }
  ) || fallback;
}

function pushTimeline(model, entry) {
  if (!entry) return null;
  const normalized = {
    index: model.timeline.length,
    atMs: Number.isFinite(entry.atMs) ? entry.atMs : null,
    category: entry.category ?? 'event',
    group: entry.group ?? entry.category ?? 'event',
    label: sanitizeText(entry.label, { maxLength: 500 }) ?? '',
    rawType: sanitizeText(entry.rawType, { maxLength: 120 }),
    role: sanitizeText(entry.role, { maxLength: 40 }),
    turnId: sanitizeText(entry.turnId, { maxLength: 100 }),
    callId: sanitizeText(entry.callId, { maxLength: 100 }),
    tool: sanitizeText(entry.tool, { maxLength: 120 }),
    detail: sanitizeText(entry.detail, { maxLength: 1200 }),
    command: sanitizeText(entry.command, { maxLength: 1000 }),
    cwd: sanitizeText(entry.cwd, { maxLength: 500 }),
    path: sanitizeText(entry.path, { maxLength: 500 }),
    query: sanitizeText(entry.query, { maxLength: 500 }),
    input: sanitizeText(entry.input, { maxLength: 1400 }),
    output: sanitizeText(entry.output, { maxLength: 1800 }),
    status: sanitizeText(entry.status, { maxLength: 120 }),
    exitCode: Number.isFinite(Number(entry.exitCode)) ? Number(entry.exitCode) : null,
    durationMs: Number.isFinite(Number(entry.durationMs)) ? Number(entry.durationMs) : null,
    failed: entry.failed === true
  };
  model.timeline.push(normalized);
  return normalized;
}

function recordTimelineEvent(model, event) {
  if (!event || event.kind === 'usage' || event.kind === 'quota' || event.kind === 'unknown') return;
  const atMs = Number.isFinite(event.atMs) ? event.atMs : null;

  if (event.kind === 'message') {
    pushTimeline(model, {
      atMs,
      category: event.role === 'user' ? 'user' : 'assistant',
      group: 'message',
      label: timelineLabel(event, event.role ?? 'message'),
      rawType: event.rawType,
      role: event.role,
      detail: event.detail
    });
    return;
  }
  if (event.kind === 'turn-start') {
    pushTimeline(model, { atMs, category: 'turn', group: 'turn', label: 'Turn started', rawType: event.rawType, turnId: event.turnId });
    return;
  }
  if (event.kind === 'turn-complete') {
    pushTimeline(model, {
      atMs,
      category: event.error ? 'error' : 'turn',
      group: 'turn',
      label: event.error ? `Turn failed: ${event.error}` : 'Turn completed',
      rawType: event.rawType,
      turnId: event.turnId,
      detail: event.error,
      durationMs: model.normalized.session.lastTurnDurationMs.value,
      failed: Boolean(event.error)
    });
    return;
  }
  if (event.kind === 'tool-start') {
    const group = toolGroup(event.tool, event.rawType);
    if (event.callId) model._activeToolCalls.set(event.callId, { ...event, group });
    pushTimeline(model, {
      atMs,
      category: group,
      group,
      label: timelineLabel(event, event.tool ?? 'tool'),
      rawType: event.rawType,
      callId: event.callId,
      tool: event.tool,
      command: event.command,
      cwd: event.cwd,
      path: event.path,
      query: event.query,
      input: event.input
    });
    return;
  }
  if (event.kind === 'tool-end') {
    const start = event.callId ? model._activeToolCalls.get(event.callId) : null;
    const group = start?.group ?? 'tool';
    const derivedDuration = Number.isFinite(event.durationMs)
      ? event.durationMs
      : (Number.isFinite(atMs) && Number.isFinite(start?.atMs) && atMs >= start.atMs ? atMs - start.atMs : null);
    const failed = (Number.isFinite(event.exitCode) && event.exitCode !== 0) || lower(event.status).includes('fail') || lower(event.status).includes('error');
    pushTimeline(model, {
      atMs,
      category: failed ? 'error' : 'result',
      group,
      label: failed ? `${start?.tool ?? 'tool'} failed` : `${start?.tool ?? 'tool'} result`,
      rawType: event.rawType,
      callId: event.callId,
      tool: start?.tool ?? null,
      command: start?.command ?? null,
      cwd: start?.cwd ?? null,
      path: start?.path ?? null,
      query: start?.query ?? null,
      input: start?.input ?? null,
      output: event.output,
      status: event.status,
      exitCode: event.exitCode,
      durationMs: derivedDuration,
      failed
    });
    if (event.callId) model._activeToolCalls.delete(event.callId);
    return;
  }
  if (event.kind === 'approval') {
    pushTimeline(model, { atMs, category: 'approval', group: 'approval', label: timelineLabel(event, 'Approval requested'), rawType: event.rawType, detail: event.detail });
    return;
  }
  if (event.kind === 'retry') {
    pushTimeline(model, { atMs, category: 'retry', group: 'error', label: timelineLabel(event, 'Retry'), rawType: event.rawType, detail: event.detail });
    return;
  }
  if (event.kind === 'error') {
    pushTimeline(model, { atMs, category: 'error', group: 'error', label: timelineLabel(event, 'Error'), rawType: event.rawType, detail: event.detail, failed: true });
    return;
  }
  if (event.kind === 'compaction') {
    pushTimeline(model, { atMs, category: 'compaction', group: 'event', label: 'Context compacted', rawType: event.rawType });
    return;
  }
  if (event.kind === 'actual-model') {
    pushTimeline(model, { atMs, category: 'model', group: 'event', label: `Model reroute → ${event.model ?? '--'}`, rawType: event.rawType });
  }
}

function applyHistoryEvent(model, event) {
  if (!event) return;
  const atMs = Number.isFinite(event.atMs) ? event.atMs : null;
  applyNormalizedEvent(model.normalized, event, { source: PROVENANCE.OFFICIAL_HISTORY });
  if (atMs != null) {
    if (model.info.startedAtMs == null || atMs < model.info.startedAtMs) model.info.startedAtMs = atMs;
    model.info.lastEventAtMs = Math.max(model.info.lastEventAtMs ?? 0, atMs);
  }
  if (event.kind === 'session-meta') {
    model.info.threadId = event.threadId ?? model.info.threadId;
    model.info.model = event.model ?? model.info.model;
    model.info.reasoning = event.reasoning ?? model.info.reasoning;
    model.info.cwd = event.cwd ?? model.info.cwd;
  } else if (event.kind === 'model-settings') {
    model.info.model = event.model ?? model.info.model;
    model.info.reasoning = event.reasoning ?? model.info.reasoning;
  } else if (event.kind === 'turn-start') model.turns.count += 1;
  else if (event.kind === 'turn-complete') {
    model.turns.completed += 1;
    model.turns.lastDurationMs = model.normalized.session.lastTurnDurationMs.value;
    if (event.error) model.errors.push({ atMs, detail: sanitizeDetail(event.error) });
  } else if (event.kind === 'tool-start') {
    const name = sanitizeText(event.tool ?? 'tool', { maxLength: 80 }) || 'tool';
    model.tools.count += 1;
    model.tools.byName[name] = (model.tools.byName[name] ?? 0) + 1;
    model.tools.recent.push({ atMs, name, callId: sanitizeText(event.callId, { maxLength: 80 }) });
    if (model.tools.recent.length > 50) model.tools.recent.shift();
    if (String(event.rawType ?? '').startsWith('mcp_tool_call')) addResourceEvidence(model, 'MCP', name, atMs);
  } else if (event.kind === 'error') model.errors.push({ atMs, detail: sanitizeDetail(event.detail) });
  else if (event.kind === 'usage') {
    if (event.inputTokens != null) model.tokens.input = event.inputTokens;
    if (event.cachedInputTokens != null) model.tokens.cached = event.cachedInputTokens;
    if (event.outputTokens != null) model.tokens.output = event.outputTokens;
    if (event.reasoningTokens != null) model.tokens.reasoning = event.reasoningTokens;
    if (event.contextWindow != null) model.tokens.contextWindow = event.contextWindow;
    if (event.contextUsed != null) model.tokens.contextUsed = event.contextUsed;
  }
  applySessionAnalyticsEvent(model.analytics, event);
  recordTimelineEvent(model, event);
}

function consumeText(model, text, { final = false } = {}) {
  const combined = `${model.remainder}${text}`;
  const parts = combined.split(/\r?\n/);
  model.remainder = final ? '' : parts.pop() ?? '';
  if (final && parts.length && parts.at(-1) === '') parts.pop();
  for (const line of parts) {
    if (!line.trim()) continue;
    try {
      const event = parseRolloutObject(JSON.parse(line));
      model.parsedLines += 1;
      if (event) applyHistoryEvent(model, event);
    } catch { model.rejectedLines += 1; }
  }
  return model;
}

function loadFileInChunks(model, filePath, fsRef = fs, chunkBytes = HISTORY_LOAD_CHUNK_BYTES) {
  const fd = fsRef.openSync(filePath, 'r');
  try {
    const stat = fsRef.fstatSync(fd);
    const buffer = Buffer.alloc(Math.max(4096, Number(chunkBytes) || HISTORY_LOAD_CHUNK_BYTES));
    let position = 0;
    while (position < stat.size) {
      const length = Math.min(buffer.length, stat.size - position);
      const read = fsRef.readSync(fd, buffer, 0, length, position);
      if (read <= 0) break;
      position += read;
      consumeText(model, buffer.subarray(0, read).toString('utf8'), { final: false });
    }
    consumeText(model, '', { final: true });
    model.offset = position;
    return position;
  } finally {
    fsRef.closeSync(fd);
  }
}

export class HistoryEngine {
  constructor({ sessionsPath, fsRef = fs } = {}) {
    this.sessionsPath = sessionsPath;
    this.fs = fsRef;
    this.index = [];
    this.cache = new Map();
  }

  discover({ limit = Number.POSITIVE_INFINITY } = {}) {
    this.index = walkJsonl(this.sessionsPath, this.fs, limit).map((filePath) => metadata(filePath, this.fs)).sort((a, b) => (b.modifiedAtMs ?? 0) - (a.modifiedAtMs ?? 0));
    return this.index;
  }

  getMetadata(id) { return this.index.find((item) => item.id === id) ?? metadata(id, this.fs); }

  load(id) {
    const filePath = this.getMetadata(id).filePath;
    const model = historicalModel(filePath);
    try {
      loadFileInChunks(model, filePath, this.fs);
      model.complete = true;
    } catch (error) { model.errors.push({ atMs: null, detail: sanitizeDetail(error?.message ?? 'read failed') }); }
    this.cache.set(id, model);
    const meta = this.index.find((item) => item.id === id);
    if (meta) meta.parsed = true;
    return model;
  }

  ensureLoaded(id) { return this.cache.get(id) ?? this.load(id); }

  tail(id) {
    const model = this.ensureLoaded(id);
    let stat;
    try { stat = this.fs.statSync(model.filePath); } catch (error) { return { changed: false, reset: false, error: sanitizeDetail(error?.message), model }; }
    if (stat.size < model.offset) {
      const reset = this.load(id);
      return { changed: true, reset: true, error: null, model: reset };
    }
    if (stat.size === model.offset) return { changed: false, reset: false, error: null, model };
    const fd = this.fs.openSync(model.filePath, 'r');
    try {
      const buffer = Buffer.alloc(Math.min(HISTORY_LOAD_CHUNK_BYTES, Math.max(1, stat.size - model.offset)));
      while (model.offset < stat.size) {
        const length = Math.min(buffer.length, stat.size - model.offset);
        const read = this.fs.readSync(fd, buffer, 0, length, model.offset);
        if (read <= 0) break;
        model.offset += read;
        model.complete = false;
        consumeText(model, buffer.subarray(0, read).toString('utf8'), { final: false });
      }
      return { changed: true, reset: false, error: null, model };
    } finally { this.fs.closeSync(fd); }
  }
}

export { walkJsonl as discoverHistoryFiles, consumeText as consumeHistoryText, loadFileInChunks as loadHistoryFileInChunks, HISTORY_LOAD_CHUNK_BYTES };
