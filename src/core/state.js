import { randomUUID } from 'node:crypto';
import { FRESHNESS } from './freshness.js';

function unknownTelemetry() {
  return {
    model: {
      requested: null,
      actual: null,
      actualSource: null,
      freshness: FRESHNESS.WAITING
    },
    context: {
      windowTokens: null,
      usedTokens: null,
      leftTokens: null,
      freshness: FRESHNESS.WAITING
    },
    usage: {
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      turnInputTokens: null,
      turnOutputTokens: null,
      freshness: FRESHNESS.WAITING
    },
    quota: {
      fiveHour: null,
      weekly: null,
      freshness: FRESHNESS.WAITING
    },
    session: {
      bound: false,
      filePath: null,
      threadId: null,
      turnCount: null,
      lastTurnDurationMs: null,
      compactCount: null,
      lastCompactAtMs: null,
      taskPlan: null,
      lastEventAtMs: null,
      freshness: FRESHNESS.WAITING
    },
    activity: {
      state: 'IDLE',
      source: 'runtime',
      activeToolCount: null,
      approvalPending: null,
      retryCount: null,
      errorCount: null,
      freshness: FRESHNESS.WAITING
    }
  };
}

export function createCurrentRunState({
  startedAtMs = Date.now(),
  authMode = 'unknown',
  authSource = 'unresolved',
  runId = randomUUID()
} = {}) {
  return {
    run: {
      id: runId,
      startedAtMs,
      authMode,
      authSource
    },
    ...unknownTelemetry()
  };
}

export function resetCurrentRunState(previousState = null, options = {}) {
  const authMode = options.authMode ?? previousState?.run?.authMode ?? 'unknown';
  const authSource = options.authSource ?? previousState?.run?.authSource ?? 'unresolved';
  return createCurrentRunState({
    startedAtMs: options.startedAtMs ?? Date.now(),
    runId: options.runId,
    authMode,
    authSource
  });
}

export function withDetectedAuth(state, auth) {
  return {
    ...state,
    run: {
      ...state.run,
      authMode: auth?.mode ?? 'unknown',
      authSource: auth?.source ?? 'unresolved'
    }
  };
}
