import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePlatformAdapter } from '../../src/platform/fake.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../../src/config/schema.js';
import { repairMonitorIntegration } from '../../src/runtime/archive-control.js';
import { doctorReport, printDoctor } from '../../src/runtime/doctor.js';
import { runSessionManagerTui } from '../../src/manager/tui.js';
import { parseControlArgs, parseMonitorArgs } from '../../src/cli/args.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p12-control-'));
}

function sessionLine() {
  return `${JSON.stringify({
    type: 'session_meta',
    timestamp: '2026-08-26T00:00:00Z',
    payload: { id: 'thread-one', model: 'gpt-x', cwd: 'C:/repo' }
  })}\n`;
}

function fakeTerminal() {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = (value) => { stdin.isRaw = value; };
  stdin.resume = () => {};
  stdin.pause = () => {};
  const stdout = new EventEmitter();
  stdout.isTTY = true;
  stdout.columns = 120;
  stdout.rows = 32;
  stdout.output = '';
  stdout.write = (data) => { stdout.output += String(data); return true; };
  return { stdin, stdout };
}

test('Manager Config shares production previews and returns to Config without saving', async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, 'one.jsonl'), sessionLine());
  const adapter = createFakePlatformAdapter({ paths: { sessions: root }, processTree: [] });
  const { stdin, stdout } = fakeTerminal();
  const processRef = new EventEmitter();
  const monitorConfig = normalizeConfig({ ...DEFAULT_CONFIG, setupComplete: true, theme: 'mono' });

  const running = runSessionManagerTui({
    platformAdapter: adapter,
    stdin,
    stdout,
    processRef,
    colorCapability: 'mono',
    theme: 'mono',
    monitorConfig,
    intervalMs: 50
  });

  setImmediate(() => {
    stdin.emit('data', Buffer.from('c'));
    stdin.emit('data', Buffer.from('p'));
    setImmediate(() => {
      stdin.emit('data', Buffer.from('\x1b'));
      setImmediate(() => {
        stdin.emit('data', Buffer.from('\x1b'));
        setImmediate(() => stdin.emit('data', Buffer.from('q')));
      });
    });
  });

  const result = await running;
  assert.equal(result.code, 0);
  assert.equal(result.configDirty, false);
  assert.match(stdout.output, /LIVE CONFIG PREVIEW/);
  assert.match(stdout.output, /CODEX MONITOR · CONFIG/);
  assert.equal(stdin.isRaw, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('doctor includes sanitized Archive status without raw session content', () => {
  const secret = 'RAW_PROMPT_SHOULD_NEVER_PRINT';
  const report = doctorReport({
    monitorConfig: normalizeConfig({ ...DEFAULT_CONFIG, setupComplete: true, archive: { ...DEFAULT_CONFIG.archive, enabled: true } }),
    readArchiveHealth() {
      return {
        serviceRunning: true,
        hookInstalled: true,
        hookComplete: true,
        sqliteHealthy: true,
        syncLabel: 'READY',
        sessions: 4,
        pendingFiles: 0,
        failedFiles: 0,
        rawPrompt: secret
      };
    }
  });
  let output = '';
  printDoctor(report, { write(value) { output += String(value); } });
  assert.match(output, /Archive: Enabled/);
  assert.match(output, /service=running/);
  assert.match(output, /sync=READY/);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.match(output, /sanitized/i);
});

test('repair is a no-op while Archive is disabled', () => {
  let hooks = 0;
  let reconciles = 0;
  const result = repairMonitorIntegration(normalizeConfig(DEFAULT_CONFIG), {
    repairHook() { hooks += 1; return { ok: true }; },
    reconcile() { reconciles += 1; return { ok: true }; }
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'archive-disabled');
  assert.equal(hooks, 0);
  assert.equal(reconciles, 0);
});

test('repair touches only the Monitor-owned Archive hook path then wakes reconcile', () => {
  const calls = [];
  const config = normalizeConfig({ ...DEFAULT_CONFIG, setupComplete: true, archive: { ...DEFAULT_CONFIG.archive, enabled: true } });
  const result = repairMonitorIntegration(config, {
    repairHook() {
      calls.push('hook');
      return { ok: true, hooks: { installed: true, changed: true, marker: '--codexm-archive-hook' } };
    },
    reconcile(received) {
      calls.push('reconcile');
      assert.equal(received.archive.enabled, true);
      return { ok: true, service: { started: true }, error: null };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'repaired');
  assert.deepEqual(calls, ['hook', 'reconcile']);
});

test('repair moved to codexmctl while codexm forwards the same flag to Codex', () => {
  assert.equal(parseControlArgs(['repair']).command, 'repair');
  assert.deepEqual(parseMonitorArgs(['--repair']).codexArgs, ['--repair']);
});
