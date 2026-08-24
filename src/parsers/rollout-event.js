import { sanitizeDetail, sanitizeText } from '../core/sanitize.js';

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function eventTimeMs(obj) {
  const raw = obj?.timestamp ?? obj?.time ?? obj?.created_at ?? obj?.createdAt ?? obj?.payload?.timestamp ?? null;
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

export function parseRolloutObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const type = eventType(obj);
  if (!type) return null;
  const payload = payloadOf(obj);
  const atMs = eventTimeMs(obj);
  const common = { type, atMs, rawType: type };

  if (type === 'session_meta' || type === 'session_metadata') {
    return {
      ...common,
      kind: 'session-meta',
      threadId: sanitizeText(payload?.id ?? payload?.thread_id ?? payload?.threadId),
      model: sanitizeText(payload?.model),
      reasoning: sanitizeText(payload?.reasoning_effort ?? payload?.reasoningEffort),
      cwd: sanitizeText(payload?.cwd)
    };
  }

  if (type === 'turn_started' || type === 'task_started') {
    return { ...common, kind: 'turn-start', turnId: sanitizeText(payload?.turn_id ?? payload?.turnId ?? payload?.id) };
  }
  if (type === 'turn_complete' || type === 'task_complete') {
    return { ...common, kind: 'turn-complete', turnId: sanitizeText(payload?.turn_id ?? payload?.turnId ?? payload?.id), error: sanitizeDetail(payload?.error?.message ?? payload?.error ?? payload?.terminal_error ?? payload?.terminalError) };
  }
  if (/^(exec_command|mcp_tool_call|web_search|patch_apply|image_generation)_begin$/.test(type) || ['function_call','custom_tool_call','local_shell_call','computer_call'].includes(type)) {
    return { ...common, kind: 'tool-start', callId: sanitizeText(payload?.call_id ?? payload?.callId ?? payload?.id ?? payload?.item_id ?? payload?.itemId), tool: sanitizeText(payload?.name ?? payload?.tool_name ?? payload?.toolName ?? payload?.server_name ?? payload?.serverName ?? type.replace(/_begin$/, '')) };
  }
  if (/^(exec_command|mcp_tool_call|web_search|patch_apply|image_generation)_end$/.test(type) || ['function_call_output','custom_tool_call_output','local_shell_call_output','computer_call_output'].includes(type)) {
    return { ...common, kind: 'tool-end', callId: sanitizeText(payload?.call_id ?? payload?.callId ?? payload?.id ?? payload?.item_id ?? payload?.itemId) };
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
      contextUsed: numberOrNull(last?.total_tokens ?? last?.totalTokens)
    };
  }

  if (type === 'rate_limits' || type === 'rate_limit') {
    return { ...common, kind: 'quota', primary: payload?.primary ?? null, secondary: payload?.secondary ?? null };
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
