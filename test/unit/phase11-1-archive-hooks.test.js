import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_HOOK_MARKER,
  buildArchiveHookHandler,
  installArchiveHooks,
  uninstallArchiveHooks
} from '../../src/archive/hook-config.js';
import { runArchiveHook } from '../../src/archive/hook-entry.js';
import {
  consumeArchiveHookSignal,
  getArchiveServicePaths,
  signalArchiveHook
} from '../../src/archive/service-control.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-hooks-'));
}

test('hook installer preserves user hooks, installs only low-frequency archive wake events, and is idempotent', () => {
  const root = tempRoot();
  const hooksPath = path.join(root, 'hooks.json');
  try {
    fs.writeFileSync(hooksPath, `${JSON.stringify({
      description: 'user hooks',
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'echo user-stop' }] }],
        SessionStart: [{ matcher: '^startup$', hooks: [{ type: 'command', command: 'echo user-start' }] }]
      }
    }, null, 2)}\n`);

    const handler = buildArchiveHookHandler({ execPath: '/node', entryPath: '/archive-hook.js' });
    assert.equal(handler.timeout, 10);
    assert.match(handler.command, /--codexm-archive-hook/);
    assert.match(handler.commandWindows, /^powershell\.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand /);
    assert.equal(handler.commandWindows.includes('"'), false);

    const encoded = handler.commandWindows.split(' ').at(-1);
    const decoded = Buffer.from(encoded, 'base64').toString('utf16le');
    assert.match(decoded, /\/node/);
    assert.match(decoded, /\/archive-hook\.js/);
    assert.match(decoded, /--codexm-archive-hook/);
    assert.match(decoded, /exit 0/);

    const first = installArchiveHooks({ hooksPath, handler });
    assert.equal(first.installed, true);
    assert.equal(first.changed, true);
    assert.deepEqual(first.events, ['SessionStart', 'UserPromptSubmit']);
    assert.equal(first.trustRequired, true);

    const parsed = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    assert.equal(parsed.description, 'user hooks');
    assert.equal(parsed.hooks.Stop[0].hooks[0].command, 'echo user-stop');
    assert.equal(parsed.hooks.SessionStart.some((group) => group.hooks?.some((hook) => hook.command === 'echo user-start')), true);
    assert.equal(parsed.hooks.SessionStart.some((group) => group.hooks?.some((hook) => hook.command?.includes(ARCHIVE_HOOK_MARKER))), true);
    assert.equal(parsed.hooks.UserPromptSubmit.some((group) => group.hooks?.some((hook) => hook.command?.includes(ARCHIVE_HOOK_MARKER))), true);
    assert.equal(parsed.hooks.PreToolUse, undefined);
    assert.equal(parsed.hooks.PostToolUse, undefined);

    const second = installArchiveHooks({ hooksPath, handler });
    assert.equal(second.installed, true);
    assert.equal(second.changed, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hook uninstaller removes only Monitor-owned handlers', () => {
  const root = tempRoot();
  const hooksPath = path.join(root, 'hooks.json');
  try {
    const handler = buildArchiveHookHandler({ execPath: '/node', entryPath: '/archive-hook.js' });
    installArchiveHooks({ hooksPath, handler });
    const document = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    document.hooks.SessionStart.push({ hooks: [{ type: 'command', command: 'echo keep-me' }] });
    fs.writeFileSync(hooksPath, `${JSON.stringify(document, null, 2)}\n`);

    const result = uninstallArchiveHooks({ hooksPath });
    assert.equal(result.removed, true);
    assert.equal(result.changed, true);
    const after = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const commands = Object.values(after.hooks).flat().flatMap((group) => group.hooks ?? []).map((hook) => hook.command ?? '');
    assert.equal(commands.some((command) => command.includes(ARCHIVE_HOOK_MARKER)), false);
    assert.equal(commands.includes('echo keep-me'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid existing hooks JSON is never overwritten', () => {
  const root = tempRoot();
  const hooksPath = path.join(root, 'hooks.json');
  try {
    fs.writeFileSync(hooksPath, '{not-json');
    const before = fs.readFileSync(hooksPath, 'utf8');
    const result = installArchiveHooks({ hooksPath });
    assert.equal(result.installed, false);
    assert.equal(result.error, 'invalid-hooks-json');
    assert.equal(fs.readFileSync(hooksPath, 'utf8'), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hook entry is fail-open and does zero work while archive is disabled', () => {
  let signals = 0;
  let services = 0;
  const disabled = runArchiveHook({
    loadConfig: () => ({ config: { archive: { enabled: false } } }),
    signalHook() { signals += 1; },
    ensureService() { services += 1; }
  });
  assert.deepEqual(disabled, { ok: true, enabled: false, signaled: false, service: null });
  assert.equal(signals, 0);
  assert.equal(services, 0);

  const failed = runArchiveHook({ loadConfig() { throw new Error('broken config'); } });
  assert.equal(failed.ok, true);
});

test('hook entry emits only local wake signal and service control errors never escape', () => {
  let signals = 0;
  const result = runArchiveHook({
    loadConfig: () => ({ config: { archive: { enabled: true } } }),
    signalHook() { signals += 1; },
    ensureService() { throw new Error('spawn failed'); }
  });
  assert.equal(result.ok, true);
  assert.equal(result.enabled, true);
  assert.equal(result.signaled, true);
  assert.equal(result.service, null);
  assert.equal(signals, 1);
});

test('hook signal survives service-start race and is consumed exactly once', () => {
  const root = tempRoot();
  try {
    const paths = getArchiveServicePaths({ dataDir: root });
    signalArchiveHook({ dataDir: root, hookPath: paths.hookPath, now: () => 1234 });
    assert.equal(consumeArchiveHookSignal({ dataDir: root, hookPath: paths.hookPath }), 1234);
    assert.equal(consumeArchiveHookSignal({ dataDir: root, hookPath: paths.hookPath }), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});