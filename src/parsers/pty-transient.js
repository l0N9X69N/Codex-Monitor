import { sanitizeDetail, sanitizeText } from '../core/sanitize.js';

const APPROVAL_PROMPT = /would you like to run the following command|press enter to confirm or esc to cancel|allow this command|allow once|approve this|approval required|requires approval|confirm\?|confirm this|yes\/no|do you want to (?:allow|approve|continue|proceed)|would you like to (?:allow|approve|continue|proceed)/i;
const APPROVAL_RESOLVED = /you approved .* to run|you denied .* to run|approval (?:was )?(?:denied|cancelled|canceled)|command (?:was )?(?:cancelled|canceled)/i;

function lastMatchIndex(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let last = -1;
  for (const match of text.matchAll(regex)) last = match.index ?? last;
  return last;
}

function transientFromClean(clean, atMs) {
  const lower = clean.toLowerCase();
  const events = [];
  if (APPROVAL_PROMPT.test(clean)) events.push({ kind: 'approval', atMs, detail: clean, source: 'pty' });
  if (APPROVAL_RESOLVED.test(clean)) events.push({ kind: 'approval-resolved', atMs, detail: clean, source: 'pty' });
  if (/retrying|retry attempt|stream disconnected|connection.*retry/.test(lower)) events.push({ kind: 'retry', atMs, detail: clean, source: 'pty' });
  if (/error:|failed to|tool.*failed|request failed/.test(lower)) events.push({ kind: 'error', atMs, detail: clean, source: 'pty' });
  return events;
}

export function parsePtyTransient(text, atMs = Date.now()) {
  const clean = sanitizeDetail(text) ?? '';
  return clean ? transientFromClean(clean, atMs) : [];
}

// Codex TUI output can split one visible approval prompt across multiple PTY
// chunks and can repaint a large portion of the screen before the prompt. Keep
// a rolling raw window, then sanitize the whole window without the 160-char
// detail truncation used for UI labels.
export class PtyTransientStreamParser {
  constructor({ maxBufferChars = 4096 } = {}) {
    this.maxBufferChars = Math.max(512, Number(maxBufferChars) || 4096);
    this.buffer = '';
    this.approvalState = null;
  }

  push(text, atMs = Date.now()) {
    const raw = String(text ?? '');
    if (!raw) return [];
    this.buffer = `${this.buffer}${raw}`.slice(-this.maxBufferChars);
    const cleanWindow = sanitizeText(this.buffer, { maxLength: this.maxBufferChars }) ?? '';
    const events = [];

    const promptIndex = lastMatchIndex(cleanWindow, APPROVAL_PROMPT);
    const resolvedIndex = lastMatchIndex(cleanWindow, APPROVAL_RESOLVED);
    const nextApprovalState = promptIndex < 0 && resolvedIndex < 0
      ? this.approvalState
      : promptIndex > resolvedIndex;

    if (nextApprovalState !== this.approvalState) {
      this.approvalState = nextApprovalState;
      events.push({
        kind: nextApprovalState ? 'approval' : 'approval-resolved',
        atMs,
        detail: nextApprovalState ? 'approval prompt' : 'approval resolved',
        source: 'pty'
      });
    }

    // Retry/error are counters, so inspect only the new chunk to avoid counting
    // a match repeatedly while it remains in the rolling approval window.
    for (const event of parsePtyTransient(raw, atMs)) {
      if (event.kind !== 'approval' && event.kind !== 'approval-resolved') events.push(event);
    }
    return events;
  }
}
