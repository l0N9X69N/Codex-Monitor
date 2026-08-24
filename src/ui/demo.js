import { createNormalizedMonitorState, setMetric } from '../core/normalized-state.js';
import { PROVENANCE } from '../core/provenance.js';
import { normalizeConfig, configForPreset } from '../config/schema.js';
import { buildLiveFrame } from './live-renderer.js';

function current(target, key, value, nowMs) {
  setMetric(target, key, value, { source: PROVENANCE.OFFICIAL_CURRENT, observedAtMs: nowMs, evidence: 'demo' });
}

export function createDemoState(kind = 'idle', { authMode = 'login', nowMs = Date.now() } = {}) {
  const state = createNormalizedMonitorState({ runId: 'demo', startedAtMs: nowMs - 742_000 });
  current(state.auth, 'mode', authMode, nowMs);
  current(state.model, 'requested', 'gpt-5.6-luna', nowMs);
  current(state.model, 'reasoning', 'medium', nowMs);
  current(state.context, 'windowTokens', 200_000, nowMs);
  current(state.context, 'usedTokens', 84_200, nowMs);
  setMetric(state.context, 'leftTokens', 115_800, { source: PROVENANCE.DERIVED, observedAtMs: nowMs, evidence: 'window-used' });
  setMetric(state.context, 'leftPercent', 58, { source: PROVENANCE.DERIVED, observedAtMs: nowMs, evidence: 'left/window' });
  current(state.usage, 'inputTokens', 28_400, nowMs);
  current(state.usage, 'cachedInputTokens', 19_100, nowMs);
  current(state.usage, 'outputTokens', 4_230, nowMs);
  current(state.usage, 'reasoningTokens', 1_840, nowMs);
  current(state.session, 'turnCount', 18, nowMs);
  setMetric(state.session, 'lastTurnDurationMs', 8_420, { source: PROVENANCE.DERIVED, observedAtMs: nowMs, evidence: 'demo-duration' });
  current(state.compaction, 'count', 2, nowMs);
  current(state.quota, 'fiveHour', { remainingPercent: 64, resetsAt: '3h42m' }, nowMs);
  current(state.quota, 'weekly', { remainingPercent: 82, resetsAt: '6d06h' }, nowMs);

  const normalized = String(kind ?? 'idle').toLowerCase();
  const mapping = {
    idle: ['IDLE', 'waiting for input'],
    thinking: ['THINKING', 'reasoning'],
    tool: ['TOOL', 'running shell'],
    approval: ['APPROVAL', 'approval request'],
    error: ['ERROR', 'tool exited with status 1']
  };
  const [activity, detail] = mapping[normalized] ?? mapping.idle;
  current(state.activity, 'state', activity, nowMs);
  current(state.activity, 'detail', detail, nowMs);
  return state;
}

export function renderDemo({
  state = 'idle',
  preset = 'recommended',
  theme = null,
  language = null,
  authMode = 'login',
  width = 100,
  height = 30,
  activeTab = 'overview',
  cwd = process.cwd(),
  nowMs = Date.now()
} = {}) {
  let config = normalizeConfig(configForPreset(preset));
  if (theme) config.theme = theme;
  if (language) config.language = language;
  const monitorState = createDemoState(state, { authMode, nowMs });
  return buildLiveFrame({ state: monitorState, config, width, height, activeTab, cwd, nowMs, health: 'OK' });
}
