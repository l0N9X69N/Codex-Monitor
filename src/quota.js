import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TAIL_BYTES = 1024 * 1024;
const MAX_CANDIDATES = 6;
const BASELINE_CONTEXT_TOKENS = 12_000;

export function getCodexHome(env = process.env) {
  return env.CODEX_HOME ? path.resolve(env.CODEX_HOME) : path.join(os.homedir(), '.codex');
}

export function getSessionsRoot(env = process.env) {
  return path.join(getCodexHome(env), 'sessions');
}

export function parseResetEpoch(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    const millis = Date.parse(trimmed);
    return Number.isFinite(millis) ? Math.floor(millis / 1000) : null;
  }
  return null;
}

function parseTimeMs(value, fallbackMs = null) {
  if (value == null) return fallbackMs;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeWindow(raw, observedAtMs = null, source = null) {
  if (!raw || typeof raw !== 'object') return null;
  const used = Number(raw.used_percent ?? raw.usedPercent);
  if (!Number.isFinite(used)) return null;
  const windowMinutesRaw = raw.window_minutes ?? raw.windowMinutes;
  const windowMinutes = Number.isFinite(Number(windowMinutesRaw)) ? Number(windowMinutesRaw) : null;
  const resetsAt = parseResetEpoch(raw.resets_at ?? raw.reset_at ?? raw.resetsAt ?? raw.resetAt);
  return {
    usedPercent: Math.max(0, Math.min(100, used)),
    remainingPercent: Math.max(0, Math.min(100, 100 - used)),
    windowMinutes,
    resetsAt,
    observedAtMs,
    source
  };
}

function classifyWindow(window, slotHint = null) {
  if (!window) return null;
  const minutes = window.windowMinutes;
  if (Number.isFinite(minutes)) {
    if (Math.abs(minutes - 300) <= 90) return 'fiveHour';
    if (minutes >= 6 * 24 * 60 && minutes <= 8 * 24 * 60) return 'weekly';
  }
  // Legacy fallback only. Never assign one unknown window to both buckets.
  if (slotHint === 'primary') return 'fiveHour';
  if (slotHint === 'secondary') return 'weekly';
  return null;
}

function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (b.observedAtMs ?? 0) >= (a.observedAtMs ?? 0) ? b : a;
}

function normalizeTokenUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    inputTokens: toNumber(raw.input_tokens ?? raw.inputTokens),
    cachedInputTokens: toNumber(raw.cached_input_tokens ?? raw.cachedInputTokens),
    cacheWriteInputTokens: toNumber(raw.cache_write_input_tokens ?? raw.cacheWriteInputTokens),
    outputTokens: toNumber(raw.output_tokens ?? raw.outputTokens),
    reasoningOutputTokens: toNumber(raw.reasoning_output_tokens ?? raw.reasoningOutputTokens),
    totalTokens: toNumber(raw.total_tokens ?? raw.totalTokens)
  };
}

function normalizeUsageInfo(info, observedAtMs = null) {
  if (!info || typeof info !== 'object') return null;
  const total = normalizeTokenUsage(info.total_token_usage ?? info.totalTokenUsage);
  const last = normalizeTokenUsage(info.last_token_usage ?? info.lastTokenUsage);
  const contextWindowRaw = info.model_context_window ?? info.modelContextWindow;
  const contextWindow = Number.isFinite(Number(contextWindowRaw)) ? Number(contextWindowRaw) : null;
  if (!total && !last && contextWindow == null) return null;
  return { total, last, contextWindow, observedAtMs };
}

export function contextRemainingPercent(usage) {
  const contextWindow = usage?.contextWindow;
  const totalInContext = usage?.last?.totalTokens;
  if (!Number.isFinite(contextWindow) || contextWindow <= BASELINE_CONTEXT_TOKENS) return null;
  if (!Number.isFinite(totalInContext)) return 100;
  const effectiveWindow = contextWindow - BASELINE_CONTEXT_TOKENS;
  const used = Math.max(0, totalInContext - BASELINE_CONTEXT_TOKENS);
  const remaining = Math.max(0, effectiveWindow - used);
  return Math.max(0, Math.min(100, Math.round((remaining / effectiveWindow) * 100)));
}

function blankState(filePath = null, mtimeMs = 0) {
  return {
    fiveHour: null,
    weekly: null,
    usage: null,
    meta: {
      model: null,
      reasoningEffort: null,
      cwd: null,
      cliVersion: null,
      modelProvider: null,
      threadId: null,
      startedAtMs: null,
      lastEventAtMs: null,
      turnCount: 0,
      currentSession: null,
      activityState: null,
      activityAtMs: null,
      turnInProgress: null,
      currentTurnId: null,
      currentTurnStartedAtMs: null,
      lastTurnDurationMs: null,
      lastTurnCompletedAtMs: null,
      compactCount: 0,
      retryCount: 0,
      errorCount: 0,
      activeToolIds: [],
      anonymousToolDepth: 0,
      approvalPending: false,
      errorActive: false
    },
    filePath,
    fileMtimeMs: mtimeMs
  };
}

function updateString(target, key, ...values) {
  const value = values.find((v) => typeof v === 'string' && v.trim());
  if (value) target[key] = value.trim();
}

function setActivity(state, activityState, atMs) {
  state.meta.activityState = activityState;
  if (Number.isFinite(atMs)) state.meta.activityAtMs = atMs;
}

function toolKey(payload) {
  const raw =
    payload?.call_id ??
    payload?.callId ??
    payload?.id ??
    payload?.item_id ??
    payload?.itemId ??
    null;
  return raw == null ? null : String(raw);
}

function activeToolSet(state) {
  if (!Array.isArray(state.meta.activeToolIds)) state.meta.activeToolIds = [];
  return new Set(state.meta.activeToolIds.map(String));
}

function storeActiveToolSet(state, set) {
  state.meta.activeToolIds = [...set];
}

function recomputeActivity(state, atMs = null) {
  let next = 'IDLE';

  // Foreground priority. A pending approval must remain visible even if the
  // tool request was already observed; TOOL must remain visible while any
  // tracked call is still active.
  if (state.meta.errorActive) next = 'ERROR';
  else if (state.meta.approvalPending) next = 'APPROVAL';
  else if (
    (Array.isArray(state.meta.activeToolIds) && state.meta.activeToolIds.length > 0) ||
    (state.meta.anonymousToolDepth ?? 0) > 0
  ) next = 'TOOL';
  else if (state.meta.turnInProgress) next = 'THINKING';

  if (state.meta.activityState !== next) setActivity(state, next, atMs);
  else if (Number.isFinite(atMs) && state.meta.activityAtMs == null) state.meta.activityAtMs = atMs;
}

const TOOL_BEGIN_EVENTS = new Set([
  'exec_command_begin',
  'mcp_tool_call_begin',
  'web_search_begin',
  'patch_apply_begin',
  'image_generation_begin'
]);

const TOOL_END_EVENTS = new Set([
  'exec_command_end',
  'mcp_tool_call_end',
  'web_search_end',
  'patch_apply_end',
  'image_generation_end'
]);

// Some Codex rollout paths persist the raw response item rather than a
// dedicated EventMsg. Tracking function/custom/local-shell calls as a second
// source makes TOOL reliable across both rollout shapes.
const TOOL_RESPONSE_BEGIN_EVENTS = new Set([
  'function_call',
  'custom_tool_call',
  'local_shell_call',
  'computer_call'
]);

const TOOL_RESPONSE_END_EVENTS = new Set([
  'function_call_output',
  'custom_tool_call_output',
  'local_shell_call_output',
  'computer_call_output'
]);

const APPROVAL_EVENTS = new Set([
  'exec_approval_request',
  'apply_patch_approval_request',
  'request_permissions',
  'request_user_input',
  'elicitation_request'
]);

function beginTool(state, payload, eventAtMs) {
  // If this execution follows a permission prompt, the prompt has now been
  // resolved and TOOL becomes the foreground state.
  state.meta.approvalPending = false;
  state.meta.errorActive = false;

  const key = toolKey(payload);
  if (key) {
    const set = activeToolSet(state);
    set.add(key);
    storeActiveToolSet(state, set);
  } else {
    state.meta.anonymousToolDepth = Math.max(0, state.meta.anonymousToolDepth ?? 0) + 1;
  }

  recomputeActivity(state, eventAtMs);
}

function endTool(state, payload, eventAtMs) {
  const key = toolKey(payload);
  if (key) {
    const set = activeToolSet(state);
    set.delete(key);
    storeActiveToolSet(state, set);
  } else if ((state.meta.anonymousToolDepth ?? 0) > 0) {
    state.meta.anonymousToolDepth -= 1;
  } else if ((state.meta.activeToolIds?.length ?? 0) === 1) {
    // Legacy end events can omit call_id. If exactly one call is active,
    // clearing it is safer than leaving TOOL stuck forever.
    state.meta.activeToolIds = [];
  }

  recomputeActivity(state, eventAtMs);
}

function applyLifecycleEvent(state, eventType, payload, eventAtMs) {
  if (!eventType) return;

  if (eventType === 'task_started' || eventType === 'turn_started') {
    state.meta.turnInProgress = true;
    state.meta.currentTurnId = payload.turn_id ?? payload.turnId ?? null;
    state.meta.currentTurnStartedAtMs = eventAtMs;
    state.meta.activeToolIds = [];
    state.meta.anonymousToolDepth = 0;
    state.meta.approvalPending = false;
    state.meta.errorActive = false;
    recomputeActivity(state, eventAtMs);
    return;
  }

  if (eventType === 'task_complete' || eventType === 'turn_complete') {
    if (Number.isFinite(state.meta.currentTurnStartedAtMs) && Number.isFinite(eventAtMs)) {
      state.meta.lastTurnDurationMs = Math.max(0, eventAtMs - state.meta.currentTurnStartedAtMs);
    }

    state.meta.lastTurnCompletedAtMs = eventAtMs;
    state.meta.turnInProgress = false;
    state.meta.currentTurnId = null;
    state.meta.activeToolIds = [];
    state.meta.anonymousToolDepth = 0;
    state.meta.approvalPending = false;

    const terminalError = payload?.error ?? payload?.terminal_error ?? payload?.terminalError;
    if (terminalError) {
      state.meta.errorCount += 1;
      state.meta.errorActive = true;
    } else {
      state.meta.errorActive = false;
    }

    recomputeActivity(state, eventAtMs);
    return;
  }

  if (TOOL_BEGIN_EVENTS.has(eventType) || TOOL_RESPONSE_BEGIN_EVENTS.has(eventType)) {
    beginTool(state, payload, eventAtMs);
    return;
  }

  if (TOOL_END_EVENTS.has(eventType) || TOOL_RESPONSE_END_EVENTS.has(eventType)) {
    endTool(state, payload, eventAtMs);
    return;
  }

  if (APPROVAL_EVENTS.has(eventType)) {
    state.meta.approvalPending = true;
    state.meta.errorActive = false;
    recomputeActivity(state, eventAtMs);
    return;
  }

  if (eventType === 'context_compacted') {
    state.meta.compactCount += 1;
    return;
  }

  if (eventType === 'stream_error') {
    state.meta.retryCount += 1;
    // Do not let a retry accidentally replace TOOL or APPROVAL.
    recomputeActivity(state, eventAtMs);
    return;
  }

  if (eventType === 'error') {
    state.meta.errorCount += 1;
    state.meta.errorActive = true;
    recomputeActivity(state, eventAtMs);
  }
}

function applyObjectToState(state, obj, fallbackTimeMs = null) {
  if (!obj || typeof obj !== 'object') return;
  const payload = obj?.payload && typeof obj.payload === 'object' ? obj.payload : obj;
  const eventAtMs = parseTimeMs(obj.timestamp ?? payload.timestamp, fallbackTimeMs);
  if (eventAtMs != null) state.meta.lastEventAtMs = Math.max(state.meta.lastEventAtMs ?? 0, eventAtMs);
  const eventType = typeof payload.type === 'string' ? payload.type : null;
  applyLifecycleEvent(state, eventType, payload, eventAtMs);

  if (obj.type === 'session_meta' || payload.type === 'session_meta') {
    const meta = payload.payload && typeof payload.payload === 'object' ? payload.payload : payload;
    updateString(state.meta, 'cwd', meta.cwd);
    updateString(state.meta, 'cliVersion', meta.cli_version, meta.cliVersion);
    updateString(state.meta, 'modelProvider', meta.model_provider, meta.modelProvider);
    updateString(state.meta, 'threadId', meta.id, meta.thread_id, meta.threadId);
    state.meta.startedAtMs ??= parseTimeMs(meta.timestamp ?? obj.timestamp, eventAtMs);
  }

  if (obj.type === 'turn_context' || payload.type === 'turn_context') {
    const ctx = payload.payload && typeof payload.payload === 'object' ? payload.payload : payload;
    updateString(state.meta, 'model', ctx.model, ctx.model_name, ctx.modelName, ctx.collaboration_mode?.settings?.model);
    updateString(
      state.meta,
      'reasoningEffort',
      ctx.reasoning_effort,
      ctx.reasoningEffort,
      ctx.model_reasoning_effort,
      ctx.modelReasoningEffort,
      ctx.collaboration_mode?.settings?.reasoning_effort
    );
    updateString(state.meta, 'cwd', ctx.cwd);
    state.meta.turnCount += 1;
  }

  if (payload.type !== 'token_count') return;

  const rateLimits = payload.rate_limits ?? payload.rateLimits;
  if (rateLimits && typeof rateLimits === 'object') {
    for (const [slot, raw] of [['primary', rateLimits.primary], ['secondary', rateLimits.secondary]]) {
      const window = normalizeWindow(raw, eventAtMs, slot);
      const bucket = classifyWindow(window, slot);
      if (bucket) state[bucket] = newer(state[bucket], window);
    }
  }

  const usage = normalizeUsageInfo(payload.info, eventAtMs);
  if (usage && (usage.observedAtMs ?? 0) >= (state.usage?.observedAtMs ?? 0)) state.usage = usage;
}

export function parseQuotaLine(line) {
  let obj;
  try { obj = JSON.parse(line); } catch { return null; }
  const state = blankState();
  applyObjectToState(state, obj);
  if (!state.fiveHour && !state.weekly && !state.usage) return null;
  return state;
}

function readTailText(filePath) {
  let fd;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) return { text: '', stat };
    const bytes = Math.min(stat.size, TAIL_BYTES);
    const start = stat.size - bytes;
    const buffer = Buffer.allocUnsafe(bytes);
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, bytes, start);
    let text = buffer.toString('utf8');
    if (start > 0) {
      const firstNl = text.indexOf('\n');
      if (firstNl >= 0) text = text.slice(firstNl + 1);
    }
    return { text, stat };
  } catch {
    return { text: '', stat: null };
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

export function readLatestStateFromFile(filePath) {
  const { text, stat } = readTailText(filePath);
  if (!stat || !text) return null;
  const state = blankState(filePath, stat.mtimeMs);
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line[0] !== '{') continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    applyObjectToState(state, obj, stat.mtimeMs);
  }
  if (!state.meta.startedAtMs) {
    const name = path.basename(filePath);
    const match = name.match(/rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/i);
    if (match) {
      const [, y, m, d, hh, mm, ss] = match;
      const parsed = Date.parse(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`);
      if (Number.isFinite(parsed)) state.meta.startedAtMs = parsed;
    }
  }
  return state;
}

function numericDirsDescending(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => Number(b) - Number(a));
  } catch { return []; }
}

function collectRecentRollouts(sessionsRoot) {
  const files = [];
  let dayFoldersSeen = 0;
  for (const year of numericDirsDescending(sessionsRoot).slice(0, 2)) {
    const yearDir = path.join(sessionsRoot, year);
    for (const month of numericDirsDescending(yearDir).slice(0, 3)) {
      const monthDir = path.join(yearDir, month);
      for (const day of numericDirsDescending(monthDir)) {
        const dayDir = path.join(monthDir, day);
        let entries = [];
        try { entries = fs.readdirSync(dayDir, { withFileTypes: true }); } catch {}
        for (const entry of entries) {
          if (!entry.isFile() || !/^rollout-.*\.jsonl$/i.test(entry.name)) continue;
          const full = path.join(dayDir, entry.name);
          try {
            const stat = fs.statSync(full);
            files.push({ path: full, mtimeMs: stat.mtimeMs });
          } catch {}
        }
        dayFoldersSeen += 1;
        if (dayFoldersSeen >= 4) return files;
      }
    }
  }
  return files;
}

function mergeQuotaFrom(state, other) {
  if (!other) return;
  state.fiveHour = newer(state.fiveHour, other.fiveHour);
  state.weekly = newer(state.weekly, other.weekly);
}

function normalizePathForCompare(value) {
  if (!value) return null;
  try {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  } catch {
    return process.platform === 'win32' ? String(value).toLowerCase() : String(value);
  }
}

function samePath(a, b) {
  const left = normalizePathForCompare(a);
  const right = normalizePathForCompare(b);
  return left != null && right != null && left === right;
}

function currentCandidateScore(item, state, activeSinceMs, cwd) {
  if (!Number.isFinite(activeSinceMs)) return null;
  const recentWrite = item.mtimeMs >= activeSinceMs - 2_000;
  const started = state?.meta?.startedAtMs;
  const recentStart = Number.isFinite(started) && started >= activeSinceMs - 15_000;
  if (!recentWrite && !recentStart) return null;

  const stateCwd = state?.meta?.cwd;
  if (cwd && stateCwd && !samePath(cwd, stateCwd)) return null;

  let score = 0;
  if (recentWrite) score += 100;
  if (recentStart) score += 80;
  if (cwd && stateCwd && samePath(cwd, stateCwd)) score += 40;
  score += Math.max(0, Math.min(20, Math.floor((item.mtimeMs - activeSinceMs) / 1000)));
  return score;
}

export function findLatestState(
  sessionsRoot = getSessionsRoot(),
  { activeSinceMs = null, cwd = null } = {}
) {
  if (!fs.existsSync(sessionsRoot)) return { state: null, filePath: null };
  const files = collectRecentRollouts(sessionsRoot).sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (files.length === 0) return { state: null, filePath: null };

  const candidates = files.slice(0, MAX_CANDIDATES);
  const parsed = candidates.map((item) => ({
    item,
    state: readLatestStateFromFile(item.path) ?? blankState(item.path, item.mtimeMs)
  }));

  let activeEntry = null;
  if (Number.isFinite(activeSinceMs)) {
    let bestScore = -Infinity;
    for (const entry of parsed) {
      const score = currentCandidateScore(entry.item, entry.state, activeSinceMs, cwd);
      if (score != null && score > bestScore) {
        bestScore = score;
        activeEntry = entry;
      }
    }
  } else {
    activeEntry = parsed[0] ?? null;
  }

  let active;
  if (activeEntry) {
    active = activeEntry.state;
    active.meta.currentSession = true;
  } else {
    // Do not leak model/token data from an older session while the new Codex
    // process is still creating its rollout. Account-wide quota data can still
    // be safely carried in from recent rollouts.
    active = blankState(null, 0);
    active.meta.cwd = cwd || null;
    active.meta.startedAtMs = Number.isFinite(activeSinceMs) ? activeSinceMs : null;
    active.meta.currentSession = false;
  }

  // Quotas are account-wide. Keep the freshest 5h/week windows independently,
  // while model/token/session data stays bound to the selected current rollout.
  for (const entry of parsed) mergeQuotaFrom(active, entry.state);

  return { state: active, filePath: activeEntry?.item?.path ?? null };
}

function mergeSessionMeta(next, previous) {
  if (!next?.meta || !previous?.meta) return;
  for (const key of [
    'model',
    'reasoningEffort',
    'cwd',
    'cliVersion',
    'modelProvider',
    'threadId',
    'startedAtMs',
    'activityState',
    'activityAtMs',
    'turnInProgress',
    'currentTurnId',
    'currentTurnStartedAtMs',
    'lastTurnDurationMs',
    'lastTurnCompletedAtMs'
  ]) {
    if (next.meta[key] == null) next.meta[key] = previous.meta[key] ?? null;
  }

  // Rebuild foreground state from the current rollout tail instead of copying
  // stale TOOL/APPROVAL flags from the previous refresh.
  if (!Array.isArray(next.meta.activeToolIds)) next.meta.activeToolIds = [];
  next.meta.anonymousToolDepth = Math.max(0, next.meta.anonymousToolDepth ?? 0);
  next.meta.approvalPending = Boolean(next.meta.approvalPending);
  next.meta.errorActive = Boolean(next.meta.errorActive);
  recomputeActivity(next, next.meta.lastEventAtMs);

  next.meta.turnCount = Math.max(next.meta.turnCount ?? 0, previous.meta.turnCount ?? 0);
  next.meta.compactCount = Math.max(next.meta.compactCount ?? 0, previous.meta.compactCount ?? 0);
  next.meta.retryCount = Math.max(next.meta.retryCount ?? 0, previous.meta.retryCount ?? 0);
  next.meta.errorCount = Math.max(next.meta.errorCount ?? 0, previous.meta.errorCount ?? 0);
  next.meta.currentSession = true;
}

export class QuotaTracker {
  constructor({
    sessionsRoot = getSessionsRoot(),
    rescanMs = 500,
    refreshMs = 150,
    activeSinceMs = null,
    cwd = null
  } = {}) {
    this.sessionsRoot = sessionsRoot;
    this.rescanMs = rescanMs;
    this.refreshMs = refreshMs;
    this.activeSinceMs = activeSinceMs;
    this.cwd = cwd;
    this.filePath = null;
    this.state = null;
    this._lastScan = 0;
    this._lastRefresh = 0;
    this._lastActiveMtimeMs = null;
    this._lastActiveSize = null;
  }

  refresh(force = false) {
    const now = Date.now();
    if (force || now - this._lastScan >= this.rescanMs) {
      const found = findLatestState(this.sessionsRoot, {
        activeSinceMs: this.activeSinceMs,
        cwd: this.cwd
      });
      this._lastScan = now;
      this._lastRefresh = now;
      this.filePath = found.filePath ?? null;
      if (found.state) this.state = found.state;
      if (this.filePath) {
        try {
          const stat = fs.statSync(this.filePath);
          this._lastActiveMtimeMs = stat.mtimeMs;
          this._lastActiveSize = stat.size;
        } catch {
          this._lastActiveMtimeMs = null;
          this._lastActiveSize = null;
        }
      }
      return this.state;
    }

    if (this.filePath && (force || now - this._lastRefresh >= this.refreshMs)) {
      this._lastRefresh = now;
      let stat = null;
      try { stat = fs.statSync(this.filePath); } catch {}
      if (
        !force && stat &&
        stat.mtimeMs === this._lastActiveMtimeMs &&
        stat.size === this._lastActiveSize
      ) {
        return this.state;
      }

      const previous = this.state;
      const active = readLatestStateFromFile(this.filePath);
      if (active) {
        mergeSessionMeta(active, previous);
        // Preserve account-wide quota windows if the active tail does not carry
        // both windows on every token_count event.
        active.fiveHour = newer(previous?.fiveHour, active.fiveHour);
        active.weekly = newer(previous?.weekly, active.weekly);
        this.state = active;
      }
      if (stat) {
        this._lastActiveMtimeMs = stat.mtimeMs;
        this._lastActiveSize = stat.size;
      }
    }
    return this.state;
  }
}
