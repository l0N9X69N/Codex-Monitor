import fs from 'node:fs';
import path from 'node:path';
import { createNormalizedMonitorState } from '../core/normalized-state.js';
import { applyNormalizedEvent } from '../core/reducer.js';
import { PROVENANCE } from '../core/provenance.js';
import { parseRolloutObject } from '../parsers/rollout-event.js';
import { sanitizeDetail, sanitizeText } from '../core/sanitize.js';

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
    normalized: createNormalizedMonitorState({ runId: filePath, startedAtMs: 0 }),
    parsedLines: 0,
    rejectedLines: 0,
    offset: 0,
    remainder: '',
    complete: false
  };
}

function addResourceEvidence(model, kind, value, atMs) {
  const clean = sanitizeText(value, { maxLength: 100 });
  if (!clean) return;
  if (model.resources.evidence.some((item) => item.kind === kind && item.value === clean)) return;
  model.resources.evidence.push({ kind, value: clean, atMs });
  if (model.resources.evidence.length > 100) model.resources.evidence.shift();
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
      const text = this.fs.readFileSync(filePath, 'utf8');
      model.offset = Buffer.byteLength(text);
      consumeText(model, text, { final: true });
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
      const length = stat.size - model.offset;
      const buffer = Buffer.alloc(length);
      this.fs.readSync(fd, buffer, 0, length, model.offset);
      model.offset = stat.size;
      model.complete = false;
      consumeText(model, buffer.toString('utf8'), { final: false });
      return { changed: true, reset: false, error: null, model };
    } finally { this.fs.closeSync(fd); }
  }
}

export { walkJsonl as discoverHistoryFiles, consumeText as consumeHistoryText };
