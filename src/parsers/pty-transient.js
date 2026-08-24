import { sanitizeDetail } from '../core/sanitize.js';

export function parsePtyTransient(text, atMs = Date.now()) {
  const clean = sanitizeDetail(text) ?? '';
  const lower = clean.toLowerCase();
  if (!clean) return [];
  const events = [];

  if (/approval|allow this command|allow once|yes\/no|confirm/.test(lower)) {
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
