export const FRESHNESS = Object.freeze({
  WAITING: 'waiting',
  CURRENT: 'current',
  STALE: 'stale'
});

export function hasKnownValue(value) {
  return value !== null && value !== undefined;
}

export function freshnessFor(value, {
  updatedAtMs = null,
  nowMs = Date.now(),
  staleAfterMs = 5_000
} = {}) {
  if (!hasKnownValue(value)) return FRESHNESS.WAITING;
  if (!Number.isFinite(updatedAtMs)) return FRESHNESS.WAITING;
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) return FRESHNESS.CURRENT;
  return nowMs - updatedAtMs > staleAfterMs ? FRESHNESS.STALE : FRESHNESS.CURRENT;
}
