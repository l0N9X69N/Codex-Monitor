export const SEVERITY = Object.freeze({
  UNKNOWN: 'unknown',
  HEALTHY: 'healthy',
  WARNING: 'warning',
  HIGH: 'high',
  CRITICAL: 'critical'
});

function finite(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function quotaRemainingSeverity(raw) {
  const value = finite(raw);
  if (value == null) return SEVERITY.UNKNOWN;
  if (value < 20) return SEVERITY.CRITICAL;
  if (value <= 50) return SEVERITY.HIGH;
  return SEVERITY.HEALTHY;
}

export function contextUsedSeverity(raw) {
  const value = finite(raw);
  if (value == null) return SEVERITY.UNKNOWN;
  if (value >= 90) return SEVERITY.CRITICAL;
  if (value >= 80) return SEVERITY.HIGH;
  if (value >= 60) return SEVERITY.WARNING;
  return SEVERITY.HEALTHY;
}

export function systemPressureSeverity(raw) {
  const value = finite(raw);
  if (value == null) return SEVERITY.UNKNOWN;
  if (value >= 85) return SEVERITY.CRITICAL;
  if (value >= 70) return SEVERITY.HIGH;
  return SEVERITY.HEALTHY;
}

export function severityToken(severity) {
  if (severity === SEVERITY.CRITICAL) return 'error';
  if (severity === SEVERITY.HIGH) return 'approval';
  if (severity === SEVERITY.WARNING) return 'thinking';
  if (severity === SEVERITY.HEALTHY) return 'healthy';
  return 'muted';
}
