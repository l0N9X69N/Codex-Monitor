import { sanitizeText } from './sanitize.js';

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
    label: sanitizeText(raw.label ?? raw.name)
  };
}

export function classifyQuotaWindow(window, slotHint = null) {
  if (!window) return null;
  const minutes = window.windowMinutes;
  if (Number.isFinite(minutes)) {
    if (Math.abs(minutes - 300) <= 90) return 'fiveHour';
    if (minutes >= 6 * 24 * 60 && minutes <= 8 * 24 * 60) return 'weekly';
  }
  if (slotHint === 'primary') return 'fiveHour';
  if (slotHint === 'secondary') return 'weekly';
  return null;
}
