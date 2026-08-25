import fs from 'node:fs';
import { discoverCurrentSessionFiles } from './current-session.js';
import { setMetric } from '../core/normalized-state.js';
import { PROVENANCE } from '../core/provenance.js';
import { classifyQuotaWindow, normalizeQuotaWindow } from '../core/quota.js';
import { parseRolloutObject } from '../parsers/rollout-event.js';

function readTail(filePath, fsRef, maxTailBytes) {
  let fd = null;
  try {
    fd = fsRef.openSync(filePath, 'r');
    const stat = fsRef.fstatSync(fd);
    const length = Math.min(stat.size, maxTailBytes);
    if (length <= 0) return { text: '', mtimeMs: stat.mtimeMs };
    const buffer = Buffer.alloc(length);
    fsRef.readSync(fd, buffer, 0, length, stat.size - length);
    return { text: buffer.toString('utf8'), mtimeMs: stat.mtimeMs };
  } catch {
    return { text: '', mtimeMs: null };
  } finally {
    if (fd != null) try { fsRef.closeSync(fd); } catch {}
  }
}

function quotaSlots(event) {
  if (event?.kind === 'quota') return [['primary', event.primary], ['secondary', event.secondary]];
  if (event?.kind === 'usage' && event.rateLimits) {
    return [['primary', event.rateLimits.primary], ['secondary', event.rateLimits.secondary]];
  }
  return [];
}

export function bootstrapAccountQuota(state, sessionsPath, {
  fsRef = fs,
  maxFiles = 30,
  maxTailBytes = 2 * 1024 * 1024
} = {}) {
  if (!state || !sessionsPath || state.auth?.mode?.value !== 'login') return { found: [] };

  const files = discoverCurrentSessionFiles(sessionsPath, fsRef).map((filePath) => {
    try { return { filePath, stat: fsRef.statSync(filePath) }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, maxFiles);

  const found = new Set();
  for (const { filePath, stat } of files) {
    if (found.size >= 2) break;
    const { text, mtimeMs } = readTail(filePath, fsRef, maxTailBytes);
    const lines = text.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0 && found.size < 2; index -= 1) {
      const line = lines[index].trim();
      if (!line) continue;
      let event = null;
      try { event = parseRolloutObject(JSON.parse(line)); } catch { continue; }
      for (const [slot, raw] of quotaSlots(event)) {
        const window = normalizeQuotaWindow(raw, slot);
        const bucket = classifyQuotaWindow(window);
        if (!window || !bucket || found.has(bucket)) continue;
        const observedAtMs = Number.isFinite(event?.atMs) ? event.atMs : (mtimeMs ?? stat.mtimeMs);
        setMetric(state.quota, bucket, window, {
          source: PROVENANCE.OFFICIAL_HISTORY,
          observedAtMs,
          evidence: `account-quota-bootstrap:${slot}`
        });
        found.add(bucket);
      }
    }
  }

  return { found: [...found] };
}
