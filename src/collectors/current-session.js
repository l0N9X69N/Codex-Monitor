import fs from 'node:fs';
import path from 'node:path';
import { MonitorIngestPipeline } from '../core/ingest.js';
import { selectCurrentSession } from '../core/session-binding.js';
import { setMetric } from '../core/normalized-state.js';
import { PROVENANCE } from '../core/provenance.js';
import { parseRolloutObject } from '../parsers/rollout-event.js';

function discoverJsonl(root, fsRef = fs, maxFiles = 200) {
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

export class CurrentSessionTailer {
  constructor({ state, sessionsPath, cwd = process.cwd(), fsRef = fs, now = () => Date.now() } = {}) {
    this.state = state;
    this.sessionsPath = sessionsPath;
    this.cwd = cwd;
    this.fs = fsRef;
    this.now = now;
    this.pipeline = new MonitorIngestPipeline(state);
    this.boundPath = null;
    this.offset = 0;
    this.remainder = '';
  }

  bind() {
    if (this.boundPath) return this.boundPath;
    const runStartedAtMs = this.state?.run?.startedAtMs;
    const candidates = discoverJsonl(this.sessionsPath, this.fs).map((filePath) => {
      let stat;
      try { stat = this.fs.statSync(filePath); } catch { return null; }
      const meta = firstSessionMeta(filePath, this.fs);
      return {
        filePath,
        startedAtMs: meta?.atMs ?? null,
        lastEventAtMs: stat.mtimeMs,
        // Initial binding never treats mtime as proof of a current run. The
        // session_meta event timestamp is the required evidence here.
        appendedAfterRun: false,
        cwd: meta?.cwd ?? null,
        currentProcessHint: false,
        sizeBytes: stat.size
      };
    }).filter(Boolean);
    const selected = selectCurrentSession(candidates, { runStartedAtMs, cwd: this.cwd, toleranceMs: 5000 });
    if (!selected) return null;
    this.boundPath = selected.filePath;
    this.offset = 0;
    this.remainder = '';
    setMetric(this.state.session, 'bound', true, { source: PROVENANCE.LOCAL, observedAtMs: this.now(), evidence: 'current-session-meta' });
    setMetric(this.state.session, 'filePath', this.boundPath, { source: PROVENANCE.LOCAL, observedAtMs: this.now(), evidence: 'current-session-meta' });
    return this.boundPath;
  }

  poll() {
    const filePath = this.bind();
    if (!filePath) return { bound: false, bytes: 0, events: 0 };
    let stat;
    try { stat = this.fs.statSync(filePath); } catch { return { bound: true, bytes: 0, events: 0, error: 'stat failed' }; }
    if (stat.size < this.offset) {
      this.offset = 0;
      this.remainder = '';
      this.pipeline = new MonitorIngestPipeline(this.state);
    }
    if (stat.size === this.offset) return { bound: true, bytes: 0, events: 0 };
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
      if (chunk) this.pipeline.pushRolloutChunk(chunk);
      return { bound: true, bytes: length, events: this.pipeline.stats.rolloutAccepted - before };
    } finally { this.fs.closeSync(fd); }
  }
}

export { discoverJsonl as discoverCurrentSessionFiles, firstSessionMeta };
