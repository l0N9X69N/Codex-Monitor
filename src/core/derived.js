import { provenanceEntry, PROVENANCE } from './provenance.js';

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

export function deriveContext(context = {}) {
  const windowTokens = finite(context.windowTokens);
  const usedTokens = finite(context.usedTokens);
  if (windowTokens == null || windowTokens <= 0 || usedTokens == null) {
    return {
      leftTokens: null,
      usedPercent: null,
      leftPercent: null,
      provenance: provenanceEntry(PROVENANCE.UNKNOWN)
    };
  }
  const leftTokens = Math.max(0, windowTokens - usedTokens);
  const usedPercent = Math.max(0, Math.min(100, (usedTokens / windowTokens) * 100));
  return {
    leftTokens,
    usedPercent,
    leftPercent: 100 - usedPercent,
    provenance: provenanceEntry(PROVENANCE.DERIVED, context.updatedAtMs ?? null, 'context.windowTokens + context.usedTokens')
  };
}

export function deriveCacheRatio(usage = {}) {
  const input = finite(usage.inputTokens);
  const cached = finite(usage.cachedInputTokens);
  if (input == null || cached == null || input <= 0) {
    return { ratio: null, provenance: provenanceEntry(PROVENANCE.UNKNOWN) };
  }
  return {
    ratio: Math.max(0, Math.min(1, cached / input)),
    provenance: provenanceEntry(PROVENANCE.DERIVED, usage.updatedAtMs ?? null, 'usage.cachedInputTokens / usage.inputTokens')
  };
}

export function deriveTurnsSinceCompact(session = {}, compaction = {}) {
  const turns = finite(session.turnCount);
  const compactTurn = finite(compaction.lastCompactTurn);
  if (turns == null || compactTurn == null) {
    return { turnsSinceCompact: null, provenance: provenanceEntry(PROVENANCE.UNKNOWN) };
  }
  return {
    turnsSinceCompact: Math.max(0, turns - compactTurn),
    provenance: provenanceEntry(PROVENANCE.DERIVED, session.lastEventAtMs ?? null, 'session.turnCount - compaction.lastCompactTurn')
  };
}
