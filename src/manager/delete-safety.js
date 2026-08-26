import fs from 'node:fs';
import path from 'node:path';
import { SESSION_ACTIVITY } from './session-core.js';

function normalizePath(value) {
  return path.resolve(String(value ?? ''));
}

function pathKey(value) {
  const resolved = normalizePath(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function isPathInsideRoot(filePath, rootPath) {
  if (!filePath || !rootPath) return false;
  const root = normalizePath(rootPath);
  const file = normalizePath(filePath);
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function statFingerprint(stat) {
  return {
    size: Number(stat?.size),
    mtimeMs: Number(stat?.mtimeMs),
    dev: Number.isFinite(Number(stat?.dev)) ? Number(stat.dev) : null,
    ino: Number.isFinite(Number(stat?.ino)) ? Number(stat.ino) : null
  };
}

function sameFingerprint(row, stat) {
  const expectedSize = Number(row?.fileSizeBytes ?? row?.sizeBytes);
  const expectedMtime = Number(row?.modifiedAtMs);
  if (Number.isFinite(expectedSize) && Number(stat?.size) !== expectedSize) return false;
  if (Number.isFinite(expectedMtime) && Math.abs(Number(stat?.mtimeMs) - expectedMtime) > 1) return false;
  return true;
}

function pathComponentsBetween(rootPath, filePath) {
  const root = normalizePath(rootPath);
  const file = normalizePath(filePath);
  const relative = path.relative(root, file);
  const parts = relative.split(path.sep).filter(Boolean);
  const out = [];
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    out.push(current);
  }
  return out;
}

function isLinkLike(stat) {
  return Boolean(stat?.isSymbolicLink?.());
}

export function validateSessionDeleteCandidate(row, {
  sessionsPath,
  fsRef = fs,
  processEvidence = null
} = {}) {
  if (!row?.id || !row?.filePath) return { ok: false, reason: 'missing-session-path' };
  if (row.state !== SESSION_ACTIVITY.ENDED) return { ok: false, reason: row.state === SESSION_ACTIVITY.LIVE ? 'live-protected' : 'active-state-uncertain' };
  if (!sessionsPath || !isPathInsideRoot(row.filePath, sessionsPath)) return { ok: false, reason: 'path-outside-sessions-root' };
  if (path.extname(String(row.filePath)).toLowerCase() !== '.jsonl') return { ok: false, reason: 'not-session-jsonl' };

  if (typeof processEvidence !== 'function') return { ok: false, reason: 'process-telemetry-unavailable' };
  const evidence = processEvidence(row) ?? {};
  if (evidence.processMatch === true) return { ok: false, reason: 'live-process-match' };
  if (evidence.processKnown !== true) return { ok: false, reason: 'active-state-uncertain' };

  try {
    const rootStat = fsRef.lstatSync(sessionsPath);
    if (isLinkLike(rootStat)) return { ok: false, reason: 'sessions-root-link-risk' };
    for (const component of pathComponentsBetween(sessionsPath, row.filePath)) {
      const linkStat = fsRef.lstatSync(component);
      if (isLinkLike(linkStat)) return { ok: false, reason: 'symlink-reparse-risk' };
    }
    const stat = fsRef.statSync(row.filePath);
    if (!stat.isFile?.()) return { ok: false, reason: 'not-regular-file' };
    if (!sameFingerprint(row, stat)) return { ok: false, reason: 'file-changed-before-delete', fingerprint: statFingerprint(stat) };
    return { ok: true, filePath: normalizePath(row.filePath), fingerprint: statFingerprint(stat) };
  } catch (error) {
    return { ok: false, reason: 'stat-failed', error: error?.message ?? String(error) };
  }
}

export function deleteSelectedSessions(rows = [], selectedIds = [], {
  sessionsPath,
  fsRef = fs,
  processEvidence = null
} = {}) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const byId = new Map((Array.isArray(rows) ? rows : []).map((row) => [row?.id, row]));
  const report = { requested: ids.size, deleted: [], rejected: [], errors: [] };
  const deletedPaths = new Set();

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      report.rejected.push({ id, reason: 'selection-not-in-current-index' });
      continue;
    }
    const validation = validateSessionDeleteCandidate(row, { sessionsPath, fsRef, processEvidence });
    if (!validation.ok) {
      report.rejected.push({ id, filePath: row.filePath ?? null, reason: validation.reason, error: validation.error ?? null });
      continue;
    }
    const key = pathKey(validation.filePath);
    if (deletedPaths.has(key)) {
      report.rejected.push({ id, filePath: validation.filePath, reason: 'duplicate-path' });
      continue;
    }
    try {
      fsRef.unlinkSync(validation.filePath);
      deletedPaths.add(key);
      report.deleted.push({ id, filePath: validation.filePath });
    } catch (error) {
      report.errors.push({ id, filePath: validation.filePath, reason: 'delete-failed', error: error?.message ?? String(error) });
    }
  }

  report.ok = report.deleted.length === report.requested && report.rejected.length === 0 && report.errors.length === 0;
  report.partial = report.deleted.length > 0 && !report.ok;
  return report;
}
