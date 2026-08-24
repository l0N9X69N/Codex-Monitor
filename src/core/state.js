import { createNormalizedMonitorState, setMetric } from './normalized-state.js';
import { PROVENANCE } from './provenance.js';

export function createCurrentRunState({
  startedAtMs = Date.now(),
  authMode = 'unknown',
  authSource = 'unresolved',
  runId = null
} = {}) {
  const state = createNormalizedMonitorState({ startedAtMs, runId });
  setMetric(state.auth, 'mode', authMode, {
    source: authMode === 'unknown' ? PROVENANCE.UNKNOWN : PROVENANCE.LOCAL,
    observedAtMs: startedAtMs,
    evidence: authMode === 'unknown' ? null : authSource
  });
  setMetric(state.auth, 'source', authSource, {
    source: authSource === 'unresolved' ? PROVENANCE.UNKNOWN : PROVENANCE.LOCAL,
    observedAtMs: startedAtMs,
    evidence: authSource === 'unresolved' ? null : 'auth-detection'
  });
  return state;
}

export function resetCurrentRunState(previousState = null, options = {}) {
  const previousAuthMode = previousState?.auth?.mode?.value ?? 'unknown';
  const previousAuthSource = previousState?.auth?.source?.value ?? 'unresolved';
  return createCurrentRunState({
    startedAtMs: options.startedAtMs ?? Date.now(),
    runId: options.runId ?? null,
    authMode: options.authMode ?? previousAuthMode,
    authSource: options.authSource ?? previousAuthSource
  });
}

export function withDetectedAuth(state, auth) {
  const observedAtMs = Date.now();
  setMetric(state.auth, 'mode', auth?.mode ?? 'unknown', {
    source: auth?.mode && auth.mode !== 'unknown' ? PROVENANCE.LOCAL : PROVENANCE.UNKNOWN,
    observedAtMs,
    evidence: auth?.source ?? null
  });
  setMetric(state.auth, 'source', auth?.source ?? 'unresolved', {
    source: auth?.source ? PROVENANCE.LOCAL : PROVENANCE.UNKNOWN,
    observedAtMs,
    evidence: 'auth-detection'
  });
  return state;
}
