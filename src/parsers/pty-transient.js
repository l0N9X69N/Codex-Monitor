import { sanitizeDetail, sanitizeText } from '../core/sanitize.js';

const APPROVAL_PROMPT = /would you like to run the following command|press enter to confirm or esc to cancel|allow this command|allow once|approve this|approval required|requires approval|confirm\?|confirm this|yes\/no|do you want to (?:allow|approve|continue|proceed)|would you like to (?:allow|approve|continue|proceed)/i;

function transientFromClean(clean, atMs) {
  const lower = clean.toLowerCase();
  const events = [];
  if (APPROVAL_PROMPT.test(clean)) events.push({ kind: 'approval', atMs, detail: clean, source: 'pty' });
  if (/retrying|retry attempt|stream disconnected|connection.*retry/.test(lower)) events.push({ kind: 'retry', atMs, detail: clean, source: 'pty' });
  if (/error:|failed to|tool.*failed|request failed/.test(lower)) events.push({ kind: 'error', atMs, detail: clean, source: 'pty' });
  return events;
}

export function parsePtyTransient(text, atMs = Date.now()) {
  const clean = sanitizeDetail(text) ?? '';
  return clean ? transientFromClean(clean, atMs) : [];
}

function isApprovalDecisionInput(raw) {
  const text = String(raw ?? '');
  if (!text) return false;
  if (text.includes('\r') || text.includes('\n')) return true;
  if (text === '\x1b') return true;
  // Codex currently exposes (p) as the direct shortcut for the persistent
  // approval option. If a future TUI keeps the prompt open after this key, the
  // short suppression window below expires and the prompt can latch again.
  return text === 'p' || text === 'P';
}

// Codex TUI output can split one visible approval prompt across multiple PTY
// chunks and can repaint a large portion of the screen before the prompt. Raw
// PTY order is not screen order: an old "You approved..." history line can be
// painted after the current approval box. Therefore approval is latched only by
// the live prompt and is never cleared by historical PTY text.
export class PtyTransientStreamParser {
  constructor({ maxBufferChars = 4096, relatchSuppressMs = 500 } = {}) {
    this.maxBufferChars = Math.max(512, Number(maxBufferChars) || 4096);
    this.relatchSuppressMs = Math.max(0, Number(relatchSuppressMs) || 500);
    this.buffer = '';
    this.approvalState = false;
    this.suppressPromptUntilMs = 0;
  }

  push(text, atMs = Date.now()) {
    const raw = String(text ?? '');
    if (!raw) return [];
    this.buffer = `${this.buffer}${raw}`.slice(-this.maxBufferChars);
    const cleanWindow = sanitizeText(this.buffer, { maxLength: this.maxBufferChars }) ?? '';
    const events = [];

    if (!this.approvalState && atMs >= this.suppressPromptUntilMs && APPROVAL_PROMPT.test(cleanWindow)) {
      this.approvalState = true;
      events.push({ kind: 'approval', atMs, detail: 'approval prompt', source: 'pty' });
    }

    // Retry/error are counters, so inspect only the new chunk to avoid counting
    // a match repeatedly while it remains in the rolling approval window.
    for (const event of parsePtyTransient(raw, atMs)) {
      if (event.kind !== 'approval') events.push(event);
    }
    return events;
  }

  observeInput(text, atMs = Date.now()) {
    if (!this.approvalState || !isApprovalDecisionInput(text)) return [];
    this.approvalState = false;
    this.buffer = '';
    this.suppressPromptUntilMs = atMs + this.relatchSuppressMs;
    return [{ kind: 'approval-resolved', atMs, detail: 'approval decision input', source: 'pty-input-observer' }];
  }
}

export { isApprovalDecisionInput };
