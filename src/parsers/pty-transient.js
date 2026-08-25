import { sanitizeDetail } from '../core/sanitize.js';

function looksLikeApprovalPrompt(lower) {
  // Do not match static status text such as
  // "Permissions: Workspace (Ask for approval...)". PTY evidence is only a
  // fallback, so keep this deliberately conservative and let rollout/session
  // events remain authoritative whenever possible.
  return /allow this command|allow once|approve this|approval required|requires approval|confirm\?|confirm this|yes\/no|do you want to (?:allow|approve|continue|proceed)|would you like to (?:allow|approve|continue|proceed)/.test(lower);
}

export function parsePtyTransient(text, atMs = Date.now()) {
  const clean = sanitizeDetail(text) ?? '';
  const lower = clean.toLowerCase();
  if (!clean) return [];
  const events = [];

  if (looksLikeApprovalPrompt(lower)) {
    events.push({ kind: 'approval', atMs, detail: clean, source: 'pty' });
  }
  if (/retrying|retry attempt|stream disconnected|connection.*retry/.test(lower)) {
    events.push({ kind: 'retry', atMs, detail: clean, source: 'pty' });
  }
  if (/error:|failed to|tool.*failed|request failed/.test(lower)) {
    events.push({ kind: 'error', atMs, detail: clean, source: 'pty' });
  }
  return events;
}
