import { padCells, truncateCells } from '../ui/cell-width.js';
import { hpaint } from '../history/theme.js';

function finiteOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fmtTime(ms) {
  const n = finiteOrNull(ms);
  if (n == null) return '--:--:--';
  try { return new Date(n).toISOString().slice(11, 19); } catch { return '--:--:--'; }
}

function fmtDuration(ms) {
  const n = finiteOrNull(ms);
  if (n == null || n < 0) return '';
  if (n < 1000) return `${Math.round(n)}ms`;
  const seconds = n / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m${String(Math.floor(seconds % 60)).padStart(2, '0')}s`;
}

function tokenFor(event) {
  if (event?.failed || event?.category === 'error') return 'error';
  if (event?.category === 'result') return 'live';
  if (event?.category === 'agent') return 'pressure';
  if (event?.category === 'shell') return 'secondary';
  if (event?.category === 'file') return 'nav';
  if (event?.category === 'turn' || event?.category === 'approval' || event?.category === 'retry') return 'pressure';
  if (event?.category === 'user') return 'session';
  if (event?.category === 'assistant') return 'text';
  return 'dim';
}

function category(event) {
  const text = String(event?.category ?? 'event').toUpperCase();
  return text.length > 8 ? text.slice(0, 8) : text;
}

export function selectedActivityPreviewLines(preview, width, rows, mode = '256') {
  const safeRows = Math.max(1, Number(rows) || 1);
  const safeWidth = Math.max(24, Number(width) || 40);
  if (!preview) return [hpaint('Select a session to preview recent activity.', 'dim', mode)];
  if (preview.error) return [hpaint(`Preview unavailable: ${preview.error}`, 'error', mode)];

  const events = Array.isArray(preview.events) ? preview.events : [];
  if (!events.length) {
    return [
      hpaint('No evidenced activity in the recent JSONL tail.', 'dim', mode),
      preview.truncated ? hpaint('Enter opens the full session timeline.', 'dim', mode) : ''
    ].filter(Boolean).slice(0, safeRows);
  }

  const visible = events.slice(-safeRows);
  return visible.map((event) => {
    const token = tokenFor(event);
    const time = hpaint(fmtTime(event.atMs), 'dim', mode);
    const kind = hpaint(padCells(category(event), 8), token, mode);
    const duration = fmtDuration(event.durationMs);
    const suffix = duration ? `  ${hpaint(duration, 'dim', mode)}` : '';
    const prefixWidth = 8 + 2 + 8 + 2;
    const labelWidth = Math.max(8, safeWidth - prefixWidth - (duration ? duration.length + 2 : 0));
    const label = truncateCells(event.label ?? event.tool ?? '--', labelWidth, '…');
    return `${time}  ${kind}  ${hpaint(label, token, mode)}${suffix}`;
  });
}
