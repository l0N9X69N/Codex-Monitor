import { sanitizeDetail, sanitizeText } from '../core/sanitize.js';

function numberOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function eventTimeMs(obj) {
  const raw = obj?.timestamp ?? obj?.time ?? obj?.created_at ?? obj?.createdAt ?? obj?.payload?.timestamp ?? obj?.payload?.meta?.timestamp ?? null;
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw > 1e12 ? raw : raw * 1000;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

function eventType(obj) {
  const outer = String(obj?.type ?? obj?.event ?? '').trim();
  const inner = String(obj?.payload?.type ?? obj?.payload?.event ?? '').trim();
  if (['event_msg', 'response_item'].includes(outer) && inner) return inner;
  return outer || inner;
}

function payloadOf(obj) {
  return obj?.payload && typeof obj.payload === 'object' ? obj.payload : obj;
}

function rateLimitsOf(payload, info = null) {
  const raw = payload?.rate_limits
    ?? payload?.rateLimits
    ?? info?.rate_limits
    ?? info?.rateLimits
    ?? null;
  return raw && typeof raw === 'object' ? raw : null;
}

function modelSettingsFrom(payload) {
  const settings = payload?.thread_settings
    ?? payload?.threadSettings
    ?? payload?.settings
    ?? payload;
  return {
    model: sanitizeText(settings?.model ?? payload?.model),
    reasoning: sanitizeText(
      settings?.reasoning_effort
      ?? settings?.reasoningEffort
      ?? settings?.effort
      ?? payload?.reasoning_effort
      ?? payload?.reasoningEffort
      ?? payload?.effort
    )
  };
}

function jsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function auditText(value, maxLength = 1200) {
  if (value == null) return null;
  if (typeof value === 'string') return sanitizeText(value, { maxLength });
  try { return sanitizeText(JSON.stringify(value), { maxLength }); } catch { return sanitizeText(String(value), { maxLength }); }
}

function messageText(payload) {
  const direct = payload?.message ?? payload?.text ?? payload?.content;
  if (typeof direct === 'string') return auditText(direct, 1200);
  if (Array.isArray(direct)) {
    const parts = direct.map((item) => {
      if (typeof item === 'string') return item;
      return item?.text ?? item?.content ?? item?.input_text ?? item?.output_text ?? '';
    }).filter(Boolean);
    return auditText(parts.join(' '), 1200);
  }
  return auditText(direct, 1200);
}

function toolAuditFields(payload) {
  const rawArgs = payload?.arguments ?? payload?.args ?? payload?.input ?? payload?.parameters ?? null;
  const args = jsonObject(rawArgs);
  return {
    command: auditText(payload?.command ?? payload?.cmd ?? args?.command ?? args?.cmd, 1000),
    cwd: sanitizeText(payload?.cwd ?? payload?.workdir ?? payload?.working_directory ?? args?.cwd ?? args?.workdir ?? args?.working_directory, { maxLength: 500 }),
    path: sanitizeText(payload?.path ?? payload?.file_path ?? payload?.filePath ?? args?.path ?? args?.file_path ?? args?.filePath, { maxLength: 500 }),
    query: auditText(payload?.query ?? args?.query ?? args?.pattern, 500),
    input: auditText(rawArgs, 1400)
  };
}

function toolResultFields(payload) {
  const result = payload?.output ?? payload?.result ?? payload?.content ?? payload?.stdout ?? payload?.response ?? null;
  return {
    output: auditText(result, 1800),
    status: sanitizeText(payload?.status ?? payload?.state, { maxLength: 120 }),
    exitCode: numberOrNull(payload?.exit_code ?? payload?.exitCode ?? payload?.code),
    durationMs: numberOrNull(payload?.duration_ms ?? payload?.durationMs ?? payload?.elapsed_ms ?? payload?.elapsedMs)
  };
}

export function parseRolloutObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const type = eventType(obj);
  if (!type) return null;
  const payload = payloadOf(obj);
  const atMs = eventTimeMs(obj);
  const common = { type, atMs, rawType: type };

  if (type === 'session_meta' || type === 'session_metadata') {
    const meta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : payload;
    const git = payload?.git && typeof payload.git === 'object'
      ? payload.git
      : (meta?.git && typeof meta.git === 'object' ? meta.git : null);
    return {
      ...common,
      kind: 'session-meta',
      threadId: sanitizeText(meta?.id ?? meta?.thread_id ?? meta?.threadId),
      model: sanitizeText(meta?.model ?? payload?.model),
      reasoning: sanitizeText(meta?.reasoning_effort ?? meta?.reasoningEffort ?? meta?.effort ?? payload?.reasoning_effort ?? payload?.reasoningEffort ?? payload?.effort),
      cwd: sanitizeText(meta?.cwd ?? payload?.cwd),
      gitBranch: sanitizeText(git?.branch ?? git?.branch_name ?? git?.branchName),
      gitCommit: sanitizeText(git?.commit_hash ?? git?.commitHash)
    };
  }

  if (type === 'turn_context' || type === 'turn_context_item') {
    const settings = modelSettingsFrom(payload);
    return {
      ...common,
      kind: 'model-settings',
      model: settings.model,
      reasoning: settings.reasoning,
      turnId: sanitizeText(payload?.turn_id ?? payload?.turnId)
    };
  }

  if (type === 'thread_settings_applied' || type === 'thread_settings_changed') {
    const settings = modelSettingsFrom(payload);
    return { ...common, kind: 'model-settings', model: settings.model, reasoning: settings.reasoning };
  }

  if (type === 'user_message' || type === 'user-message') {
    return { ...common, kind: 'message', role: 'user', detail: messageText(payload) };
  }
  if (type === 'agent_message' || type === 'assistant_message' || type === 'assistant-message') {
    return { ...common, kind: 'message', role: 'assistant', detail: messageText(payload) };
  }
  if (type === 'message') {
    const role = sanitizeText(payload?.role ?? obj?.role, { maxLength: 40 });
    if (role === 'user' || role === 'assistant') return { ...common, kind: 'message', role, detail: messageText(payload) };
  }

  if (type === 'turn_started' || type === 'task_started') {
    return { ...common, kind: 'turn-start', turnId: sanitizeText(payload?.turn_id ?? payload?.turnId ?? payload?.id) };
  }
  if (type === 'turn_complete' || type === 'task_complete') {
    return {
      ...common,
      kind: 'turn-complete',
      turnId: sanitizeText(payload?.turn_id ?? payload?.turnId ?? payload?.id),
      error: sanitizeDetail(payload?.error?.message ?? payload?.error ?? payload?.terminal_error ?? payload?.terminalError)
    };
  }
  if (/^(exec_command|mcp_tool_call|web_search|patch_apply|image_generation)_begin$/.test(type) || ['function_call','custom_tool_call','local_shell_call','computer_call'].includes(type)) {
    return {
      ...common,
      kind: 'tool-start',
      callId: sanitizeText(payload?.call_id ?? payload?.callId ?? payload?.id ?? payload?.item_id ?? payload?.itemId),
      tool: sanitizeText(payload?.name ?? payload?.tool_name ?? payload?.toolName ?? payload?.server_name ?? payload?.serverName ?? type.replace(/_begin$/, '')),
      ...toolAuditFields(payload)
    };
  }
  if (/^(exec_command|mcp_tool_call|web_search|patch_apply|image_generation)_end$/.test(type) || ['function_call_output','custom_tool_call_output','local_shell_call_output','computer_call_output'].includes(type)) {
    return {
      ...common,
      kind: 'tool-end',
      callId: sanitizeText(payload?.call_id ?? payload?.callId ?? payload?.id ?? payload?.item_id ?? payload?.itemId),
      ...toolResultFields(payload)
    };
  }
  if (['exec_approval_request','apply_patch_approval_request','request_permissions','request_user_input','elicitation_request'].includes(type)) {
    return { ...common, kind: 'approval', detail: sanitizeDetail(payload?.message ?? payload?.reason ?? type) };
  }
  if (type === 'stream_error') return { ...common, kind: 'retry', detail: sanitizeDetail(payload?.message ?? payload?.error?.message) };
  if (type === 'error') return { ...common, kind: 'error', detail: sanitizeDetail(payload?.message ?? payload?.error?.message ?? payload?.error) };
  if (type === 'context_compacted' || type === 'compacted') return { ...common, kind: 'compaction' };

  if (type === 'token_count' || type === 'token_usage') {
    const info = payload?.info ?? payload;
    const total = info?.total_token_usage ?? info?.totalTokenUsage ?? info?.total ?? {};
    const last = info?.last_token_usage ?? info?.lastTokenUsage ?? info?.last ?? {};
    const rateLimits = rateLimitsOf(payload, info);
    return {
      ...common,
      kind: 'usage',
      inputTokens: numberOrNull(total?.input_tokens ?? total?.inputTokens),
      cachedInputTokens: numberOrNull(total?.cached_input_tokens ?? total?.cachedInputTokens),
      outputTokens: numberOrNull(total?.output_tokens ?? total?.outputTokens),
      reasoningTokens: numberOrNull(total?.reasoning_output_tokens ?? total?.reasoningOutputTokens),
      turnInputTokens: numberOrNull(last?.input_tokens ?? last?.inputTokens),
      turnOutputTokens: numberOrNull(last?.output_tokens ?? last?.outputTokens),
      contextWindow: numberOrNull(info?.model_context_window ?? info?.modelContextWindow),
      contextUsed: numberOrNull(last?.total_tokens ?? last?.totalTokens),
      rateLimits
    };
  }

  if (type === 'rate_limits' || type === 'rate_limit') {
    const limits = payload?.rate_limits ?? payload?.rateLimits ?? payload;
    return { ...common, kind: 'quota', primary: limits?.primary ?? null, secondary: limits?.secondary ?? null };
  }

  if (type === 'model_reroute') {
    return { ...common, kind: 'actual-model', model: sanitizeText(payload?.to ?? payload?.model ?? payload?.actual_model ?? payload?.actualModel) };
  }

  return { ...common, kind: 'unknown' };
}

export function parseRolloutLine(line) {
  if (typeof line !== 'string' || !line.trim()) return { ok: false, error: 'empty' };
  try {
    const obj = JSON.parse(line);
    const event = parseRolloutObject(obj);
    return event ? { ok: true, event } : { ok: false, error: 'unrecognized-object' };
  } catch {
    return { ok: false, error: 'malformed-json' };
  }
}
