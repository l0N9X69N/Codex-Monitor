import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { discoverCurrentSessionFiles, firstSessionMeta } from '../collectors/current-session.js';
import { sanitizeText } from '../core/sanitize.js';

function samePath(a, b, platform = process.platform) {
  if (!a || !b) return false;
  const left = path.resolve(String(a));
  const right = path.resolve(String(b));
  return platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function previewFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const outer = obj.type;
  const payload = obj.payload && typeof obj.payload === 'object' ? obj.payload : obj;
  if (outer === 'response_item' && payload?.type === 'message' && payload?.role === 'user') {
    const text = (payload.content ?? [])
      .filter((item) => item?.type === 'input_text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join(' ');
    return sanitizeText(text, { maxLength: 140 });
  }
  if (outer === 'event_msg' && payload?.type === 'user_message') {
    return sanitizeText(payload?.message, { maxLength: 140 });
  }
  return null;
}

function firstUserPreview(filePath, fsRef = fs, maxBytes = 256 * 1024) {
  let fd = null;
  try {
    fd = fsRef.openSync(filePath, 'r');
    const stat = fsRef.fstatSync(fd);
    const length = Math.min(stat.size, maxBytes);
    if (length <= 0) return null;
    const buffer = Buffer.alloc(length);
    fsRef.readSync(fd, buffer, 0, length, 0);
    for (const line of buffer.toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const preview = previewFromObject(JSON.parse(line));
        if (preview) return preview;
      } catch {}
    }
  } catch {}
  finally { if (fd != null) try { fsRef.closeSync(fd); } catch {} }
  return null;
}

export function listLocalResumeSessions(sessionsPath, {
  cwd = process.cwd(),
  showAll = false,
  fsRef = fs,
  maxSessions = 80,
  platform = process.platform
} = {}) {
  const sessions = [];
  for (const filePath of discoverCurrentSessionFiles(sessionsPath, fsRef)) {
    try {
      const stat = fsRef.statSync(filePath);
      const meta = firstSessionMeta(filePath, fsRef);
      if (!meta?.threadId) continue;
      if (!showAll && meta.cwd && !samePath(meta.cwd, cwd, platform)) continue;
      sessions.push({
        threadId: meta.threadId,
        filePath,
        cwd: meta.cwd ?? null,
        startedAtMs: meta.atMs ?? null,
        updatedAtMs: stat.mtimeMs,
        preview: firstUserPreview(filePath, fsRef) ?? '(no user preview)'
      });
    } catch {}
  }
  sessions.sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
  return sessions.slice(0, Math.max(1, Number(maxSessions) || 80));
}

function formatAge(timestamp, nowMs = Date.now()) {
  const delta = Math.max(0, nowMs - (Number(timestamp) || nowMs));
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function renderPicker(stdout, sessions, selected, { showAll = false, nowMs = Date.now() } = {}) {
  const height = Math.max(10, stdout.rows || 24);
  const visible = Math.max(4, Math.min(12, height - 7));
  const start = Math.max(0, Math.min(selected - Math.floor(visible / 2), Math.max(0, sessions.length - visible)));
  const end = Math.min(sessions.length, start + visible);
  const width = Math.max(50, stdout.columns || 100);
  const lines = [
    'Codex Monitor · Local Resume',
    `Local sessions${showAll ? ' · all directories' : ' · current directory'} · ↑/↓ select · Enter resume · Esc cancel`,
    ''
  ];
  for (let index = start; index < end; index += 1) {
    const item = sessions[index];
    const marker = index === selected ? '›' : ' ';
    const age = formatAge(item.updatedAtMs, nowMs).padStart(4);
    const maxPreview = Math.max(18, width - 12);
    const preview = String(item.preview ?? '').length > maxPreview
      ? `${String(item.preview).slice(0, Math.max(1, maxPreview - 1))}…`
      : String(item.preview ?? '');
    lines.push(`${marker} ${age}  ${preview}`);
  }
  lines.push('', `${selected + 1}/${sessions.length}`);
  stdout.write(`\x1b[2J\x1b[H${lines.join('\n')}`);
}

export async function pickLocalResumeSession({
  sessionsPath,
  cwd = process.cwd(),
  showAll = false,
  stdin = process.stdin,
  stdout = process.stdout,
  fsRef = fs,
  now = () => Date.now()
} = {}) {
  const sessions = listLocalResumeSessions(sessionsPath, { cwd, showAll, fsRef });
  if (sessions.length === 0) return { selected: null, reason: 'no-local-sessions' };
  if (!stdin?.isTTY || !stdout?.isTTY || typeof stdin.setRawMode !== 'function') {
    return { selected: sessions[0], reason: 'non-interactive-fallback' };
  }

  readline.emitKeypressEvents(stdin);
  const previousRaw = Boolean(stdin.isRaw);
  let selected = 0;
  stdin.setRawMode(true);
  stdin.resume();
  renderPicker(stdout, sessions, selected, { showAll, nowMs: now() });

  return await new Promise((resolve) => {
    const finish = (session, reason) => {
      stdin.off('keypress', onKey);
      try { stdin.setRawMode(previousRaw); } catch {}
      if (!previousRaw) try { stdin.pause(); } catch {}
      stdout.write('\x1b[2J\x1b[H');
      resolve({ selected: session, reason });
    };
    const onKey = (_str, key = {}) => {
      if (key.name === 'up') selected = (selected - 1 + sessions.length) % sessions.length;
      else if (key.name === 'down') selected = (selected + 1) % sessions.length;
      else if (key.name === 'return' || key.name === 'enter') return finish(sessions[selected], 'selected');
      else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) return finish(null, 'cancelled');
      else return;
      renderPicker(stdout, sessions, selected, { showAll, nowMs: now() });
    };
    stdin.on('keypress', onKey);
  });
}

export function localResumePickerIntent(codexArgs = []) {
  const args = Array.isArray(codexArgs) ? codexArgs.map(String) : [];
  if (args[0]?.toLowerCase() !== 'resume') return null;
  const rest = args.slice(1);
  if (rest.includes('--last')) return null;
  const allowed = new Set(['--all', '--include-non-interactive']);
  if (rest.some((arg) => !allowed.has(arg))) return null;
  return { showAll: rest.includes('--all') };
}

export function codexArgsForLocalResume(codexArgs, threadId) {
  const args = Array.isArray(codexArgs) ? codexArgs.map(String) : [];
  const preserved = args.slice(1).filter((arg) => arg === '--include-non-interactive');
  return ['resume', String(threadId), ...preserved];
}

export { firstUserPreview, previewFromObject };
