import fs from 'node:fs';
import path from 'node:path';
import { MonitorIngestPipeline } from '../core/ingest.js';
import { selectCurrentSession } from '../core/session-binding.js';
import { setMetric } from '../core/normalized-state.js';
import { PROVENANCE } from '../core/provenance.js';
import { applyNormalizedEvent } from '../core/reducer.js';
import { parseRolloutObject } from '../parsers/rollout-event.js';

function discoverJsonl(root, fsRef = fs, maxFiles = 500) {
  if (!root || !fsRef.existsSync(root)) return [];
  const files = [];
  const stack = [root];
  while (stack.length && files.length < maxFiles) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fsRef.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
      if (files.length >= maxFiles) break;
    }
  }
  return files;
}

function firstSessionMeta(filePath, fsRef = fs) {
  let fd = null;
  try {
    fd = fsRef.openSync(filePath, 'r');
    const stat = fsRef.fstatSync(fd);
    const length = Math.min(stat.size, 64 * 1024);
    if (length <= 0) return null;
    const buffer = Buffer.alloc(length);
    fsRef.readSync(fd, buffer, 0, length, 0);
    for (const line of buffer.toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = parseRolloutObject(JSON.parse(line));
        if (event?.kind === 'session-meta') return event;
      } catch {}
    }
  } catch {}
  finally { if (fd != null) try { fsRef.closeSync(fd); } catch {} }
  return null;
}

function fileSnapshot(root, fsRef = fs) {
  const map = new Map();
  for (const filePath of discoverJsonl(root, fsRef)) {
    try {
      const stat = fsRef.statSync(filePath);
      map.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {}
  }
  return map;
}

function resetResumeTransientState(state, atMs) {
  setMetric(state.session, 'turnInProgress', false, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
  setMetric(state.session, 'currentTurnId', null, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
  setMetric(state.session, 'currentTurnStartedAtMs', null, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
  setMetric(state.activity, 'state', 'IDLE', { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
  setMetric(state.activity, 'detail', 'waiting for input', { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
  setMetric(state.activity, 'source', 'runtime', { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
  setMetric(state.activity, 'activeTools', [], { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
  setMetric(state.activity, 'approvalPending', false, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
  setMetric(state.activity, 'errorActive', false, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
  if (state.tools) setMetric(state.tools, 'current', null, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'resume-bootstrap-reset' });
}

function readSegment(filePath, start, length, fsRef = fs) {
  if (length <= 0) return '';
  const fd = fsRef.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    fsRef.readSync(fd, buffer, 0, length, start);
    return buffer.toString('utf8');
  } finally { fsRef.closeSync(fd); }
}

function latestQuotaEvent(filePath, fsRef = fs, maxTailBytes = 2 * 1024 * 1024) {
  try {
    const stat = fsRef.statSync(filePath);
    const start = Math.max(0, stat.size - maxTailBytes);
    const text = readSegment(filePath, start, stat.size - start, fsRef);
    const lines = text.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        const event = parseRolloutObject(JSON.parse(line));
        if (event?.kind === 'quota') return event;
        if (event?.kind === 'usage' && event.rateLimits) {
          return {
            kind: 'quota',
            atMs: event.atMs,
            rawType: `${event.rawType ?? 'token_count'}:rate_limits-bootstrap`,
            primary: event.rateLimits.primary ?? null,
            secondary: event.rateLimits.secondary ?? null
          };
        }
      } catch {}
    }
  } catch {}
  return null;
}

export function bootstrapLatestAccountQuota(state, sessionsPath, { fsRef = fs } = {}) {
  if (!state || !sessionsPath || state.auth?.mode?.value !== 'login') return null;
  const files = discoverJsonl(sessionsPath, fsRef).map((filePath) => {
    try { return { filePath, stat: fsRef.statSync(filePath) }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, 30);

  for (const { filePath } of files) {
    const event = latestQuotaEvent(filePath, fsRef);
    if (!event) continue;
    applyNormalizedEvent(state, event, { source: PROVENANCE.OFFICIAL_HISTORY });
    return { filePath, atMs: event.atMs ?? null };
  }
  return null;
}

export class CurrentSessionTailer {
  constructor({ state, sessionsPath, cwd = process.cwd(), fsRef = fs, now = () => Date.now(), resumeMode = false } = {}) {
    this.state = state;
    this.sessionsPath = sessionsPath;
    this.cwd = cwd;
    this.fs = fsRef;
    this.now = now;
    this.resumeMode = Boolean(resumeMode);
    this.initialFiles = this.resumeMode ? fileSnapshot(sessionsPath, fsRef) : new Map();
    this.pipeline = new MonitorIngestPipeline(state);
    this.boundPath = null;
    this.offset = 0;
    this.remainder = '';
    this.lastBindAttemptAtMs = 0;
    setMetric(this.state.session, 'resumeMode', this.resumeMode, {
      source: PROVENANCE.LOCAL,
      observedAtMs: this.now(),
      evidence: 'codex-args'
    });
  }

  hydrateResume(filePath, initialSize) {
    if (!this.resumeMode || !Number.isFinite(initialSize) || initialSize <= 0) return;
    const preservedQuota = {
      fiveHour: this.state.quota.fiveHour,
      weekly: this.state.quota.weekly
    };
    const text = readSegment(filePath, 0, initialSize, this.fs);
    const parts = text.split(/\r?\n/);
    const remainder = parts.pop() ?? '';
    const chunk = parts.length ? `${parts.join('\n')}\n` : '';
    if (chunk) this.pipeline.pushRolloutChunk(chunk, { source: PROVENANCE.OFFICIAL_HISTORY });
    if (remainder.trim()) this.pipeline.pushRolloutChunk(`${remainder}\n`, { source: PROVENANCE.OFFICIAL_HISTORY });

    for (const key of ['fiveHour', 'weekly']) {
      const saved = preservedQuota[key];
      const current = this.state.quota[key];
      if (saved?.value != null && (saved.updatedAtMs ?? 0) >= (current?.updatedAtMs ?? 0)) this.state.quota[key] = saved;
    }

    const atMs = this.now();
    setMetric(this.state.session, 'resumedHistoryTurns', this.state.session.turnCount.value, {
      source: PROVENANCE.DERIVED,
      observedAtMs: atMs,
      evidence: 'turn count after resume history replay'
    });
    resetResumeTransientState(this.state, atMs);
    this.offset = initialSize;
    this.remainder = '';
  }

  bind() {
    if (this.boundPath) return this.boundPath;
    const nowMs = this.now();
    if (nowMs - this.lastBindAttemptAtMs < 750) return null;
    this.lastBindAttemptAtMs = nowMs;
    const runStartedAtMs = this.state?.run?.startedAtMs;
    const recent = discoverJsonl(this.sessionsPath, this.fs).map((filePath) => {
      try {
        const stat = this.fs.statSync(filePath);
        const initial = this.initialFiles.get(filePath) ?? null;
        return { filePath, stat, initial };
      } catch { return null; }
    }).filter(Boolean)
      .filter(({ stat, initial }) => this.resumeMode
        ? (initial == null || stat.size > initial.size || stat.mtimeMs >= runStartedAtMs - 10_000)
        : (!Number.isFinite(runStartedAtMs) || stat.mtimeMs >= runStartedAtMs - 10_000))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      .slice(0, this.resumeMode ? 50 : 20);

    const candidates = recent.map(({ filePath, stat, initial }) => {
      const meta = firstSessionMeta(filePath, this.fs);
      return {
        filePath,
        startedAtMs: meta?.atMs ?? null,
        lastEventAtMs: stat.mtimeMs,
        appendedAfterRun: Boolean(initial && stat.size > initial.size),
        resumeTouchedAfterRun: Boolean(this.resumeMode && initial && stat.mtimeMs > initial.mtimeMs && stat.mtimeMs >= runStartedAtMs - 10_000),
        cwd: meta?.cwd ?? null,
        currentProcessHint: false,
        sizeBytes: stat.size,
        initialSize: Number.isFinite(initial?.size) ? initial.size : 0
      };
    });
    const selected = selectCurrentSession(candidates, { runStartedAtMs, cwd: this.cwd, toleranceMs: 5000 });
    if (!selected) return null;
    this.boundPath = selected.filePath;
    this.offset = 0;
    this.remainder = '';
    if (this.resumeMode && selected.initialSize > 0) this.hydrateResume(this.boundPath, selected.initialSize);
    setMetric(this.state.session, 'bound', true, { source: PROVENANCE.LOCAL, observedAtMs: nowMs, evidence: this.resumeMode ? 'resumed-session-meta' : 'current-session-meta' });
    setMetric(this.state.session, 'filePath', this.boundPath, { source: PROVENANCE.LOCAL, observedAtMs: nowMs, evidence: this.resumeMode ? 'resumed-session-meta' : 'current-session-meta' });
    return this.boundPath;
  }

  poll() {
    const filePath = this.bind();
    if (!filePath) return { bound: false, bytes: 0, events: 0, resumed: this.resumeMode };
    let stat;
    try { stat = this.fs.statSync(filePath); } catch { return { bound: true, bytes: 0, events: 0, error: 'stat failed', resumed: this.resumeMode }; }
    if (stat.size < this.offset) {
      this.offset = 0;
      this.remainder = '';
      this.pipeline = new MonitorIngestPipeline(this.state);
    }
    if (stat.size === this.offset) return { bound: true, bytes: 0, events: 0, resumed: this.resumeMode };
    const fd = this.fs.openSync(filePath, 'r');
    try {
      const length = stat.size - this.offset;
      const buffer = Buffer.alloc(length);
      this.fs.readSync(fd, buffer, 0, length, this.offset);
      this.offset = stat.size;
      const text = `${this.remainder}${buffer.toString('utf8')}`;
      const parts = text.split(/\r?\n/);
      this.remainder = parts.pop() ?? '';
      const chunk = parts.length ? `${parts.join('\n')}\n` : '';
      const before = this.pipeline.stats.rolloutAccepted;
      if (chunk) this.pipeline.pushRolloutChunk(chunk, { source: PROVENANCE.OFFICIAL_CURRENT });
      return { bound: true, bytes: length, events: this.pipeline.stats.rolloutAccepted - before, resumed: this.resumeMode };
    } finally { this.fs.closeSync(fd); }
  }
}

export { discoverJsonl as discoverCurrentSessionFiles, firstSessionMeta };
