import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { codexHome } from '../platform/common.js';

export const ARCHIVE_HOOK_MARKER = '--codexm-archive-hook';
export const ARCHIVE_HOOK_EVENTS = Object.freeze(['SessionStart', 'UserPromptSubmit']);
export const ARCHIVE_HOOK_ENTRY_PATH = fileURLToPath(new URL('./hook-entry.js', import.meta.url));

function quotePosix(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildWindowsEncodedCommand(execPath, entryPath) {
  const script = `& ${quotePowerShell(execPath)} ${quotePowerShell(entryPath)} ${quotePowerShell(ARCHIVE_HOOK_MARKER)}; exit 0`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isOwnedHandler(handler) {
  if (handler?.type !== 'command') return false;
  if (typeof handler.command !== 'string') return false;
  if (handler.command.includes(ARCHIVE_HOOK_MARKER)) return true;
  // Windows handlers use EncodedCommand, so the marker is not visible in the
  // persisted command. Decode only our PowerShell shape for ownership checks.
  const match = handler.command.match(/^powershell\.exe\s+-NoLogo\s+-NoProfile\s+-NonInteractive\s+-EncodedCommand\s+([A-Za-z0-9+/=]+)$/i);
  if (!match) return false;
  try {
    return Buffer.from(match[1], 'base64').toString('utf16le').includes(ARCHIVE_HOOK_MARKER);
  } catch {
    return false;
  }
}

function stripOwnedHandlers(document) {
  let changed = false;
  const hooks = document.hooks;
  for (const [eventName, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const nextGroups = [];
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) {
        nextGroups.push(group);
        continue;
      }
      const handlers = group.hooks.filter((handler) => !isOwnedHandler(handler));
      if (handlers.length !== group.hooks.length) changed = true;
      if (handlers.length > 0) nextGroups.push({ ...group, hooks: handlers });
      else if (group.hooks.length === 0) nextGroups.push(group);
    }
    if (nextGroups.length !== groups.length) changed = true;
    hooks[eventName] = nextGroups;
  }
  return changed;
}

function readHooksDocument(hooksPath, fsRef) {
  try {
    const raw = fsRef.readFileSync(hooksPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isObject(parsed) || (parsed.hooks !== undefined && !isObject(parsed.hooks))) {
      return { ok: false, exists: true, error: 'unsupported-hooks-shape', document: null };
    }
    if (!parsed.hooks) parsed.hooks = {};
    return { ok: true, exists: true, error: null, document: parsed };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: true, exists: false, error: null, document: { hooks: {} } };
    if (error instanceof SyntaxError) return { ok: false, exists: true, error: 'invalid-hooks-json', document: null };
    return { ok: false, exists: true, error: error?.message ?? String(error), document: null };
  }
}

function writeHooksDocument(hooksPath, document, fsRef) {
  fsRef.mkdirSync(path.dirname(hooksPath), { recursive: true, mode: 0o700 });
  const tempPath = `${hooksPath}.codexm.tmp`;
  fsRef.writeFileSync(tempPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fsRef.renameSync(tempPath, hooksPath);
}

export function getCodexHooksPath({ env = process.env, homedir } = {}) {
  return path.join(codexHome({ env, homedir }), 'hooks.json');
}

export function inspectArchiveHooks({ hooksPath = getCodexHooksPath(), fsRef = fs } = {}) {
  const loaded = readHooksDocument(hooksPath, fsRef);
  if (!loaded.ok) return { installed: false, complete: false, hooksPath, events: [], handlerCount: 0, error: loaded.error };
  if (!loaded.exists) return { installed: false, complete: false, hooksPath, events: [], handlerCount: 0, error: null };
  const events = [];
  let handlerCount = 0;
  for (const eventName of ARCHIVE_HOOK_EVENTS) {
    const groups = Array.isArray(loaded.document.hooks?.[eventName]) ? loaded.document.hooks[eventName] : [];
    let found = false;
    for (const group of groups) {
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
      for (const handler of handlers) {
        if (!isOwnedHandler(handler)) continue;
        handlerCount += 1;
        found = true;
      }
    }
    if (found) events.push(eventName);
  }
  return {
    installed: events.length > 0,
    complete: ARCHIVE_HOOK_EVENTS.every((eventName) => events.includes(eventName)),
    hooksPath,
    events,
    handlerCount,
    error: null
  };
}

export function buildArchiveHookHandler({
  execPath = process.execPath,
  entryPath = ARCHIVE_HOOK_ENTRY_PATH,
  platform = process.platform
} = {}) {
  const command = platform === 'win32'
    ? buildWindowsEncodedCommand(execPath, entryPath)
    : `${quotePosix(execPath)} ${quotePosix(entryPath)} ${ARCHIVE_HOOK_MARKER}`;
  return { type: 'command', command, timeout: 10 };
}

export function installArchiveHooks({ hooksPath = getCodexHooksPath(), fsRef = fs, handler = buildArchiveHookHandler() } = {}) {
  const loaded = readHooksDocument(hooksPath, fsRef);
  if (!loaded.ok) {
    return { installed: false, changed: false, hooksPath, trustRequired: true, error: loaded.error };
  }

  const document = loaded.document;
  const before = JSON.stringify(document);
  stripOwnedHandlers(document);
  const sessionStart = Array.isArray(document.hooks.SessionStart) ? document.hooks.SessionStart : [];
  sessionStart.push({ matcher: 'startup|resume|clear|compact', hooks: [{ ...handler }] });
  document.hooks.SessionStart = sessionStart;
  const userPrompt = Array.isArray(document.hooks.UserPromptSubmit) ? document.hooks.UserPromptSubmit : [];
  userPrompt.push({ hooks: [{ ...handler }] });
  document.hooks.UserPromptSubmit = userPrompt;

  const changed = before !== JSON.stringify(document);
  if (changed) writeHooksDocument(hooksPath, document, fsRef);
  return {
    installed: true,
    changed,
    hooksPath,
    events: [...ARCHIVE_HOOK_EVENTS],
    trustRequired: true,
    error: null
  };
}

export function uninstallArchiveHooks({ hooksPath = getCodexHooksPath(), fsRef = fs } = {}) {
  const loaded = readHooksDocument(hooksPath, fsRef);
  if (!loaded.ok) return { removed: false, changed: false, hooksPath, error: loaded.error };
  if (!loaded.exists) return { removed: true, changed: false, hooksPath, error: null };
  const document = loaded.document;
  const changed = stripOwnedHandlers(document);
  if (changed) writeHooksDocument(hooksPath, document, fsRef);
  return { removed: true, changed, hooksPath, error: null };
}