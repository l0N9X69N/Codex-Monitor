import { createNormalizedMonitorState, setMetric } from './normalized-state.js';
import { PROVENANCE } from './provenance.js';

export function createCurrentRunState({
  startedAtMs = Date.now(),
  authMode = 'unknown',
  authSource = 'unresolved',
  runId = null
} = {}) {
  const state = createNormalizedMonitorState({ startedAtMs, runId });
  if (authMode !== 'unknown') {
    setMetric(state.auth, 'mode', authMode, {
      source: PROVENANCE.LOCAL,
      observedAtMs: startedAtMs,
      evidence: authSource !== 'unresolved' ? authSource : null
    });
  }
  if (authSource !== 'unresolved') {
    setMetric(state.auth, 'source', authSource, {
      source: PROVENANCE.LOCAL,
      observedAtMs: startedAtMs,
      evidence: 'auth-detection'
    });
  }
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
  const mode = auth?.mode ?? 'unknown';
  const source = auth?.source ?? 'unresolved';
  if (mode !== 'unknown') {
    setMetric(state.auth, 'mode', mode, {
      source: PROVENANCE.LOCAL,
      observedAtMs,
      evidence: source !== 'unresolved' ? source : null
    });
  }
  if (source !== 'unresolved') {
    setMetric(state.auth, 'source', source, {
      source: PROVENANCE.LOCAL,
      observedAtMs,
      evidence: 'auth-detection'
    });
  }
  return state;
}
