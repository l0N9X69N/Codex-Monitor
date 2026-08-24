import { FRESHNESS } from './freshness.js';
import { provenanceEntry, PROVENANCE } from './provenance.js';

function metric(value = null) {
  return {
    value,
    freshness: FRESHNESS.WAITING,
    provenance: provenanceEntry(PROVENANCE.UNKNOWN),
    updatedAtMs: null
  };
}

export function createNormalizedMonitorState({ runId = null, startedAtMs = Date.now() } = {}) {
  return {
    run: { id: runId, startedAtMs },
    auth: {
      mode: metric('unknown'),
      source: metric(null)
    },
    model: {
      requested: metric(null),
      actual: metric(null),
      reasoning: metric(null)
    },
    context: {
      windowTokens: metric(null),
      usedTokens: metric(null),
      leftTokens: metric(null),
      usedPercent: metric(null),
      leftPercent: metric(null)
    },
    usage: {
      inputTokens: metric(null),
      cachedInputTokens: metric(null),
      outputTokens: metric(null),
      reasoningTokens: metric(null),
      turnInputTokens: metric(null),
      turnOutputTokens: metric(null),
      cacheRatio: metric(null)
    },
    quota: {
      fiveHour: metric(null),
      weekly: metric(null)
    },
    session: {
      bound: metric(false),
      filePath: metric(null),
      threadId: metric(null),
      turnCount: metric(null),
      turnInProgress: metric(false),
      currentTurnId: metric(null),
      currentTurnStartedAtMs: metric(null),
      lastTurnDurationMs: metric(null),
      lastTurnCompletedAtMs: metric(null),
      lastEventAtMs: metric(null)
    },
    activity: {
      state: metric('IDLE'),
      detail: metric(null),
      source: metric('runtime'),
      activeTools: metric([]),
      approvalPending: metric(false),
      retryCount: metric(null),
      errorCount: metric(null),
      errorActive: metric(false)
    },
    compaction: {
      count: metric(null),
      lastCompactAtMs: metric(null),
      lastCompactTurn: metric(null),
      turnsSinceCompact: metric(null)
    },
    git: {
      branch: metric(null),
      dirty: metric(null)
    },
    system: {
      cpuPercent: metric(null),
      memoryBytes: metric(null)
    },
    resources: {
      instructions: metric(null),
      skills: metric(null),
      mcp: metric(null),
      rules: metric(null),
      permissions: metric(null)
    },
    freshness: {
      overall: FRESHNESS.WAITING
    }
  };
}

export function setMetric(target, key, value, {
  source = PROVENANCE.OFFICIAL_CURRENT,
  observedAtMs = Date.now(),
  evidence = null,
  freshness = FRESHNESS.CURRENT
} = {}) {
  target[key] = {
    value,
    freshness,
    provenance: provenanceEntry(source, observedAtMs, evidence),
    updatedAtMs: Number.isFinite(observedAtMs) ? observedAtMs : null
  };
}
