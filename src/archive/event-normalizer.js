import { parseRolloutLine } from '../parsers/rollout-event.js';

function oversizedLineError(line) {
  if (!line?.oversized) return null;
  const bytes = Number(line?.byteLength ?? 0);
  return line.oversizedCompleteRecord === false
    ? `oversized-jsonl-record-discarded:${bytes}:continuation`
    : `oversized-jsonl-record-discarded:${bytes}`;
}

export function normalizeArchiveLines(lines = [], {
  sessionId = null,
  parseLine = parseRolloutLine
} = {}) {
  let resolvedSessionId = sessionId ?? null;
  const events = [];
  const parseErrors = [];

  for (const line of lines) {
    const oversizedError = oversizedLineError(line);
    if (oversizedError) {
      parseErrors.push({ sourceOffset: line?.sourceOffset ?? null, error: oversizedError });
      events.push({
        kind: 'archive-parse-error',
        rawType: 'archive_parse_error',
        atMs: null,
        sourceOffset: line?.sourceOffset ?? null,
        nextOffset: line?.nextOffset ?? null,
        detail: oversizedError
      });
      continue;
    }

    const parsed = parseLine(line?.text);
    if (!parsed?.ok || !parsed.event) {
      const error = parsed?.error ?? 'unrecognized-line';
      parseErrors.push({ sourceOffset: line?.sourceOffset ?? null, error });
      events.push({
        kind: 'archive-parse-error',
        rawType: 'archive_parse_error',
        atMs: null,
        sourceOffset: line?.sourceOffset ?? null,
        nextOffset: line?.nextOffset ?? null,
        detail: error
      });
      continue;
    }

    const event = {
      ...parsed.event,
      sourceOffset: line?.sourceOffset ?? null,
      nextOffset: line?.nextOffset ?? null
    };
    if (event.kind === 'session-meta' && event.threadId) resolvedSessionId = event.threadId;
    events.push(event);
  }

  return { sessionId: resolvedSessionId, events, parseErrors };
}
