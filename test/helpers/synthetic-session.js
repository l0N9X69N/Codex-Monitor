export function jsonl(events = []) {
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}

export function event(type, payload = {}, timestamp = '2026-08-24T10:00:00.000Z') {
  return { timestamp, type, payload };
}

export function usageEvent({ input = 100, cached = 40, output = 10, reasoning = 3, turnInput = 20, turnOutput = 2, contextWindow = 1000, contextUsed = 250 } = {}) {
  return event('token_usage', {
    info: {
      total_token_usage: {
        input_tokens: input,
        cached_input_tokens: cached,
        output_tokens: output,
        reasoning_output_tokens: reasoning
      },
      last_token_usage: {
        input_tokens: turnInput,
        output_tokens: turnOutput,
        total_tokens: contextUsed
      },
      model_context_window: contextWindow
    }
  });
}
