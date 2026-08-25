import { createNormalizedMonitorState, setMetric } from '../core/normalized-state.js';
import { PROVENANCE } from '../core/provenance.js';
import { normalizeConfig, configForPreset } from '../config/schema.js';
import { buildLiveFrame } from './live-renderer.js';

function current(target, key, value, nowMs) {
  setMetric(target, key, value, { source: PROVENANCE.OFFICIAL_CURRENT, observedAtMs: nowMs, evidence: 'demo' });
}

function derived(target, key, value, nowMs, evidence) {
  setMetric(target, key, value, { source: PROVENANCE.DERIVED, observedAtMs: nowMs, evidence });
}

function local(target, key, value, nowMs, evidence = 'demo-local') {
  setMetric(target, key, value, { source: PROVENANCE.LOCAL, observedAtMs: nowMs, evidence });
}

export function createDemoState(kind = 'idle', { authMode = 'login', nowMs = Date.now() } = {}) {
  const state = createNormalizedMonitorState({ runId: 'demo', startedAtMs: nowMs - 182_000 });
  current(state.auth, 'mode', authMode, nowMs);
  current(state.model, 'requested', 'gpt-5.6-luna', nowMs);
  current(state.model, 'reasoning', 'high', nowMs);
  if (authMode === 'api') current(state.model, 'actual', 'gpt-5.6-luna', nowMs);

  current(state.context, 'windowTokens', 258_000, nowMs);
  current(state.context, 'usedTokens', 95_600, nowMs);
  derived(state.context, 'leftTokens', 162_400, nowMs, 'window-used');
  derived(state.context, 'usedPercent', 37, nowMs, 'used/window');
  derived(state.context, 'leftPercent', 63, nowMs, 'left/window');

  current(state.usage, 'inputTokens', 843_000, nowMs);
  current(state.usage, 'cachedInputTokens', 749_000, nowMs);
  current(state.usage, 'outputTokens', 9_500, nowMs);
  current(state.usage, 'reasoningTokens', 4_900, nowMs);
  current(state.usage, 'turnInputTokens', 95_400, nowMs);
  current(state.usage, 'turnOutputTokens', 189, nowMs);
  derived(state.usage, 'cacheRatio', 749_000 / 843_000, nowMs, 'cached/input');

  current(state.session, 'bound', true, nowMs);
  current(state.session, 'threadId', '019c-demo-7fa2', nowMs);
  current(state.session, 'turnCount', 6, nowMs);
  current(state.session, 'lastEventAtMs', nowMs - 2_000, nowMs);
  derived(state.session, 'lastTurnDurationMs', 16_000, nowMs, 'demo-duration');
  current(state.compaction, 'count', 1, nowMs);
  current(state.compaction, 'lastCompactTurn', 4, nowMs);
  derived(state.compaction, 'turnsSinceCompact', 2, nowMs, 'turnCount-lastCompactTurn');

  if (authMode === 'login') {
    current(state.quota, 'fiveHour', { remainingPercent: 64, resetsAt: '3h42m' }, nowMs);
    current(state.quota, 'weekly', { remainingPercent: 84, resetsAt: '5d22h' }, nowMs);
  }

  local(state.system, 'cpuPercent', 24, nowMs);
  local(state.system, 'memoryBytes', 13_678_000_000, nowMs);
  local(state.git, 'branch', 'main', nowMs, 'demo-git');
  local(state.git, 'dirty', true, nowMs, 'demo-git');
  local(state.git, 'diff', { changedFiles: 3, additions: 10, deletions: 1 }, nowMs, 'demo-git');
  local(state.git, 'aheadBehind', { ahead: 2, behind: 1 }, nowMs, 'demo-git');

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
  current(state.activity, 'source', 'rollout', nowMs);
  current(state.activity, 'activeTools', normalized === 'tool' ? ['shell'] : [], nowMs);
  current(state.activity, 'approvalPending', normalized === 'approval', nowMs);
  current(state.activity, 'retryCount', normalized === 'error' ? 1 : 0, nowMs);
  current(state.activity, 'errorCount', normalized === 'error' ? 1 : 0, nowMs);
  current(state.activity, 'errorActive', normalized === 'error', nowMs);
  current(state.tools, 'current', normalized === 'tool' ? { name: 'shell' } : null, nowMs);
  current(state.tools, 'last', { name: 'exec' }, nowMs);
  return state;
}

export function renderDemo({
  state = 'idle',
  preset = 'recommended',
  config: suppliedConfig = null,
  theme = null,
  language = null,
  authMode = 'login',
  width = 100,
  height = 30,
  activeTab = 'overview',
  cwd = process.cwd(),
  nowMs = Date.now()
} = {}) {
  let config = suppliedConfig
    ? normalizeConfig(suppliedConfig)
    : normalizeConfig(configForPreset(preset));
  if (theme) config.theme = theme;
  if (language) config.language = language;
  const monitorState = createDemoState(state, { authMode, nowMs });
  return buildLiveFrame({ state: monitorState, config, width, height, activeTab, cwd, nowMs, health: 'OK' });
}
