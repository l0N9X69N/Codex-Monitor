import { resolveActivityState } from './activity.js';
import { deriveCacheRatio, deriveContext, deriveTurnsSinceCompact } from './derived.js';
import { PROVENANCE } from './provenance.js';
import { classifyQuotaWindow, normalizeQuotaWindow } from './quota.js';
import { setMetric } from './normalized-state.js';

function activeTools(state) {
  const value = state.activity.activeTools?.value;
  return Array.isArray(value) ? [...value] : [];
}

function updateActivity(state, atMs, detail = null, source = PROVENANCE.OFFICIAL_CURRENT) {
  const tools = activeTools(state);
  const next = resolveActivityState({
    error: Boolean(state.activity.errorActive.value),
    approval: Boolean(state.activity.approvalPending.value),
    tool: tools.length > 0,
    thinking: Boolean(state.session.turnInProgress.value)
  });
  setMetric(state.activity, 'state', next, { source, observedAtMs: atMs, evidence: 'activity-priority' });
  if (detail != null) setMetric(state.activity, 'detail', detail, { source, observedAtMs: atMs });
}

function writeDerived(state, atMs) {
  const context = deriveContext({ windowTokens: state.context.windowTokens.value, usedTokens: state.context.usedTokens.value, updatedAtMs: atMs });
  if (context.leftTokens != null) {
    setMetric(state.context, 'leftTokens', context.leftTokens, { source: PROVENANCE.DERIVED, observedAtMs: atMs, evidence: context.provenance.evidence });
    setMetric(state.context, 'usedPercent', context.usedPercent, { source: PROVENANCE.DERIVED, observedAtMs: atMs, evidence: context.provenance.evidence });
    setMetric(state.context, 'leftPercent', context.leftPercent, { source: PROVENANCE.DERIVED, observedAtMs: atMs, evidence: context.provenance.evidence });
  }
  const cache = deriveCacheRatio({ inputTokens: state.usage.inputTokens.value, cachedInputTokens: state.usage.cachedInputTokens.value, updatedAtMs: atMs });
  if (cache.ratio != null) setMetric(state.usage, 'cacheRatio', cache.ratio, { source: PROVENANCE.DERIVED, observedAtMs: atMs, evidence: cache.provenance.evidence });
  const compact = deriveTurnsSinceCompact({ turnCount: state.session.turnCount.value, lastEventAtMs: atMs }, { lastCompactTurn: state.compaction.lastCompactTurn.value });
  if (compact.turnsSinceCompact != null) setMetric(state.compaction, 'turnsSinceCompact', compact.turnsSinceCompact, { source: PROVENANCE.DERIVED, observedAtMs: atMs, evidence: compact.provenance.evidence });
}

function applyQuota(state, event, atMs, source) {
  for (const [slot, raw] of [['primary', event.primary], ['secondary', event.secondary]]) {
    const window = normalizeQuotaWindow(raw, slot);
    const bucket = classifyQuotaWindow(window, slot);
    if (!window || !bucket) continue;
    setMetric(state.quota, bucket, window, { source, observedAtMs: atMs, evidence: `rate-limit:${slot}` });
  }
}

function trackToolStart(state, event, atMs, source) {
  if (!state.tools) return;
  const name = event.tool ?? 'tool';
  const record = { callId: event.callId ?? null, name, startedAtMs: atMs, turnId: state.session.currentTurnId.value ?? null };
  const counts = { ...(state.tools.counts?.value ?? {}) };
  counts[name] = (Number(counts[name]) || 0) + 1;
  const recent = Array.isArray(state.tools.recent?.value) ? [...state.tools.recent.value] : [];
  recent.push(record);
  while (recent.length > 20) recent.shift();
  setMetric(state.tools, 'current', record, { source, observedAtMs: atMs, evidence: 'tool-start' });
  setMetric(state.tools, 'counts', counts, { source, observedAtMs: atMs, evidence: 'current-run aggregate' });
  setMetric(state.tools, 'recent', recent, { source, observedAtMs: atMs, evidence: 'current-run only' });
}

function trackToolEnd(state, event, atMs, source) {
  if (!state.tools) return;
  const current = state.tools.current?.value;
  const matching = current && (!event.callId || !current.callId || current.callId === event.callId) ? current : null;
  if (matching) {
    const last = { ...matching, endedAtMs: atMs, ok: true };
    setMetric(state.tools, 'last', last, { source, observedAtMs: atMs, evidence: 'tool-end' });
    setMetric(state.tools, 'current', null, { source, observedAtMs: atMs, evidence: 'tool-end' });
  }
}

function markToolError(state, detail, atMs, source) {
  if (!state.tools) return;
  const current = state.tools.current?.value;
  if (current) {
    setMetric(state.tools, 'last', { ...current, endedAtMs: atMs, ok: false, detail: detail ?? null }, { source, observedAtMs: atMs, evidence: 'tool/session error' });
    setMetric(state.tools, 'current', null, { source, observedAtMs: atMs, evidence: 'tool/session error' });
  }
  const count = state.tools.errorCount?.value;
  setMetric(state.tools, 'errorCount', Number.isFinite(count) ? count + 1 : 1, { source, observedAtMs: atMs, evidence: 'current-run error aggregate' });
}

export function applyNormalizedEvent(state, event, { source = PROVENANCE.OFFICIAL_CURRENT } = {}) {
  if (!state || !event?.kind) return state;
  const atMs = Number.isFinite(event.atMs) ? event.atMs : Date.now();
  setMetric(state.session, 'lastEventAtMs', atMs, { source, observedAtMs: atMs, evidence: event.rawType ?? event.kind });

  switch (event.kind) {
    case 'session-meta':
      if (event.threadId != null) setMetric(state.session, 'threadId', event.threadId, { source, observedAtMs: atMs });
      if (event.model != null) setMetric(state.model, 'requested', event.model, { source, observedAtMs: atMs });
      if (event.reasoning != null) setMetric(state.model, 'reasoning', event.reasoning, { source, observedAtMs: atMs });
      break;
    case 'turn-start':
      setMetric(state.session, 'turnInProgress', true, { source, observedAtMs: atMs });
      setMetric(state.session, 'currentTurnId', event.turnId ?? null, { source, observedAtMs: atMs });
      setMetric(state.session, 'currentTurnStartedAtMs', atMs, { source, observedAtMs: atMs });
      setMetric(state.activity, 'approvalPending', false, { source, observedAtMs: atMs });
      setMetric(state.activity, 'errorActive', false, { source, observedAtMs: atMs });
      updateActivity(state, atMs, 'reasoning', source);
      break;
    case 'turn-complete': {
      const started = state.session.currentTurnStartedAtMs.value;
      const previousTurns = state.session.turnCount.value;
      setMetric(state.session, 'turnCount', Number.isFinite(previousTurns) ? previousTurns + 1 : 1, { source, observedAtMs: atMs });
      setMetric(state.session, 'turnInProgress', false, { source, observedAtMs: atMs });
      setMetric(state.session, 'currentTurnId', null, { source, observedAtMs: atMs });
      setMetric(state.session, 'lastTurnCompletedAtMs', atMs, { source, observedAtMs: atMs });
      if (Number.isFinite(started)) setMetric(state.session, 'lastTurnDurationMs', Math.max(0, atMs - started), { source: PROVENANCE.DERIVED, observedAtMs: atMs, evidence: 'turn-complete - turn-start' });
      setMetric(state.activity, 'activeTools', [], { source, observedAtMs: atMs });
      setMetric(state.activity, 'approvalPending', false, { source, observedAtMs: atMs });
      if (event.error) {
        const count = state.activity.errorCount.value;
        setMetric(state.activity, 'errorCount', Number.isFinite(count) ? count + 1 : 1, { source, observedAtMs: atMs });
        setMetric(state.activity, 'errorActive', true, { source, observedAtMs: atMs });
        markToolError(state, event.error, atMs, source);
        updateActivity(state, atMs, event.error, source);
      } else {
        setMetric(state.activity, 'errorActive', false, { source, observedAtMs: atMs });
        updateActivity(state, atMs, 'waiting for input', source);
      }
      break;
    }
    case 'tool-start': {
      const tools = activeTools(state);
      const id = event.callId ?? `anonymous:${tools.length + 1}`;
      if (!tools.includes(id)) tools.push(id);
      setMetric(state.activity, 'activeTools', tools, { source, observedAtMs: atMs });
      // Do not clear approval here. Codex can announce/start the tool call before
      // the visible permission prompt is resolved; APPROVAL must keep priority.
      setMetric(state.activity, 'errorActive', false, { source, observedAtMs: atMs });
      trackToolStart(state, event, atMs, source);
      updateActivity(state, atMs, `running ${event.tool ?? 'tool'}`, source);
      break;
    }
    case 'tool-end': {
      let tools = activeTools(state);
      if (event.callId) tools = tools.filter((id) => id !== event.callId);
      else if (tools.length === 1) tools = [];
      setMetric(state.activity, 'activeTools', tools, { source, observedAtMs: atMs });
      // Approval is cleared by approval-resolved/turn-complete, not by tool
      // lifecycle events that can race with the TUI prompt.
      trackToolEnd(state, event, atMs, source);
      updateActivity(state, atMs, null, source);
      break;
    }
    case 'approval':
      setMetric(state.activity, 'approvalPending', true, { source, observedAtMs: atMs });
      setMetric(state.activity, 'errorActive', false, { source, observedAtMs: atMs });
      updateActivity(state, atMs, event.detail ?? 'approval request', source);
      break;
    case 'approval-resolved':
      setMetric(state.activity, 'approvalPending', false, { source, observedAtMs: atMs });
      updateActivity(state, atMs, null, source);
      break;
    case 'retry': {
      const count = state.activity.retryCount.value;
      setMetric(state.activity, 'retryCount', Number.isFinite(count) ? count + 1 : 1, { source, observedAtMs: atMs });
      updateActivity(state, atMs, null, source);
      break;
    }
    case 'error': {
      const count = state.activity.errorCount.value;
      setMetric(state.activity, 'errorCount', Number.isFinite(count) ? count + 1 : 1, { source, observedAtMs: atMs });
      setMetric(state.activity, 'errorActive', true, { source, observedAtMs: atMs });
      markToolError(state, event.detail, atMs, source);
      updateActivity(state, atMs, event.detail ?? 'session error', source);
      break;
    }
    case 'compaction': {
      const count = state.compaction.count.value;
      setMetric(state.compaction, 'count', Number.isFinite(count) ? count + 1 : 1, { source, observedAtMs: atMs });
      setMetric(state.compaction, 'lastCompactAtMs', atMs, { source, observedAtMs: atMs });
      if (Number.isFinite(state.session.turnCount.value)) setMetric(state.compaction, 'lastCompactTurn', state.session.turnCount.value, { source, observedAtMs: atMs });
      break;
    }
    case 'usage':
      for (const [key, metricValue] of Object.entries({ inputTokens: event.inputTokens, cachedInputTokens: event.cachedInputTokens, outputTokens: event.outputTokens, reasoningTokens: event.reasoningTokens, turnInputTokens: event.turnInputTokens, turnOutputTokens: event.turnOutputTokens })) {
        if (metricValue != null) setMetric(state.usage, key, metricValue, { source, observedAtMs: atMs });
      }
      if (event.contextWindow != null) setMetric(state.context, 'windowTokens', event.contextWindow, { source, observedAtMs: atMs });
      if (event.contextUsed != null) setMetric(state.context, 'usedTokens', event.contextUsed, { source, observedAtMs: atMs });
      break;
    case 'quota':
      applyQuota(state, event, atMs, source);
      break;
    case 'actual-model':
      if (event.model != null) setMetric(state.model, 'actual', event.model, { source, observedAtMs: atMs });
      break;
    default:
      break;
  }

  writeDerived(state, atMs);
  return state;
}
