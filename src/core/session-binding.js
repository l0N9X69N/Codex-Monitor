import path from 'node:path';

function normalizePath(value, platform = process.platform) {
  if (!value) return null;
  const resolved = path.resolve(String(value));
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function pathMatch(a, b, platform) {
  const left = normalizePath(a, platform);
  const right = normalizePath(b, platform);
  return Boolean(left && right && left === right);
}

export function hasCurrentRunEvidence(candidate, {
  runStartedAtMs,
  toleranceMs = 3_000
} = {}) {
  if (!candidate || !Number.isFinite(runStartedAtMs)) return false;
  const threshold = runStartedAtMs - Math.max(0, toleranceMs);

  const startedDuringRun = Number.isFinite(candidate.startedAtMs)
    && candidate.startedAtMs >= threshold;

  const appendedDuringRun = candidate.appendedAfterRun === true
    && Number.isFinite(candidate.lastEventAtMs)
    && candidate.lastEventAtMs >= threshold;

  // Resume re-opens an existing rollout, so its original session_meta timestamp
  // is intentionally old. Codex can touch/re-open the selected rollout before
  // it appends the next event. This evidence is only set by the resume-aware
  // tailer; normal runs still reject mtime-only candidates.
  const resumedDuringRun = candidate.resumeTouchedAfterRun === true
    && Number.isFinite(candidate.lastEventAtMs)
    && candidate.lastEventAtMs >= threshold;

  return startedDuringRun || appendedDuringRun || resumedDuringRun;
}

export function scoreCurrentRunCandidate(candidate, {
  runStartedAtMs,
  cwd = null,
  toleranceMs = 3_000,
  platform = process.platform
} = {}) {
  if (!hasCurrentRunEvidence(candidate, { runStartedAtMs, toleranceMs })) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (candidate.appendedAfterRun === true) score += 100;
  if (candidate.resumeTouchedAfterRun === true) score += 90;
  if (Number.isFinite(candidate.startedAtMs) && candidate.startedAtMs >= runStartedAtMs - toleranceMs) score += 80;
  if (cwd && candidate.cwd && pathMatch(cwd, candidate.cwd, platform)) score += 25;
  if (candidate.currentProcessHint === true) score += 40;

  if (Number.isFinite(candidate.lastEventAtMs)) {
    const age = Math.max(0, candidate.lastEventAtMs - runStartedAtMs);
    score += Math.min(20, age / 1_000);
  }
  return score;
}

export function selectCurrentSession(candidates = [], criteria = {}) {
  let selected = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const score = scoreCurrentRunCandidate(candidate, criteria);
    if (score > bestScore) {
      bestScore = score;
      selected = candidate;
    }
  }

  return Number.isFinite(bestScore) ? selected : null;
}
