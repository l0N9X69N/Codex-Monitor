import { sanitizeText } from './sanitize.js';

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function epochLikeToMs(value) {
  let n = numberOrNull(value);
  if (n == null || n <= 0) return null;

  // Current Codex uses Unix seconds. Accept a few common alternate precisions
  // defensively so a malformed unit never leaks as a raw giant number in UI.
  if (n < 1e12) {
    while (n > 4_102_444_800) n /= 10; // seconds beyond year 2100 are implausible for a quota reset
    return Math.round(n * 1000);
  }
  if (n < 1e15) return Math.round(n); // milliseconds
  if (n < 1e18) return Math.round(n / 1000); // microseconds
  return Math.round(n / 1_000_000); // nanoseconds
}

export function normalizeQuotaWindow(raw, slot = null) {
  if (!raw || typeof raw !== 'object') return null;
  const usedPercent = numberOrNull(raw.used_percent ?? raw.usedPercent);
  const windowMinutes = numberOrNull(raw.window_minutes ?? raw.windowMinutes);
  const resetsAt = numberOrNull(raw.resets_at ?? raw.reset_at ?? raw.resetsAt ?? raw.resetAt);
  if (usedPercent == null && windowMinutes == null && resetsAt == null) return null;
  const used = usedPercent == null ? null : Math.max(0, Math.min(100, usedPercent));
  return {
    slot,
    usedPercent: used,
    remainingPercent: used == null ? null : 100 - used,
    windowMinutes,
    resetsAt,
    resetsAtMs: epochLikeToMs(resetsAt),
    label: sanitizeText(raw.label ?? raw.name)
  };
}

export function classifyQuotaWindow(window) {
  if (!window) return null;
  const minutes = window.windowMinutes;
  if (Number.isFinite(minutes)) {
    if (Math.abs(minutes - 300) <= 90) return 'fiveHour';
    if (minutes >= 6 * 24 * 60 && minutes <= 8 * 24 * 60) return 'weekly';
    return null;
  }

  const label = String(window.label ?? '').toLowerCase();
  if (/\b5\s*h|five.?hour/.test(label)) return 'fiveHour';
  if (/week/.test(label)) return 'weekly';

  // Do not infer 5H/WEEK from primary/secondary position alone. The slot order
  // is transport metadata, not a stable semantic label.
  return null;
}

export { epochLikeToMs as quotaEpochToMs };
