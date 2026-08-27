import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeManagerInput } from '../../src/manager/input.js';
import { renderConfigPreview } from '../../src/config/preview.js';
import { renderResetConfirm, confirmMonitorReset } from '../../src/config/reset-confirm.js';
import { CONFIG_VERSION, DEFAULT_CONFIG, normalizeConfig } from '../../src/config/schema.js';
import { loadMonitorConfig, saveMonitorConfig } from '../../src/config/store.js';
import { runStandaloneConfigTui } from '../../src/config/tui.js';
import { cellWidth } from '../../src/ui/cell-width.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase12-config-ux-'));
}

function fakeTty() {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = () => {};
  stdin.resume = () => {};
  stdin.pause = () => {};

  const stdout = new EventEmitter();
  stdout.isTTY = true;
  stdout.columns = 120;
  stdout.rows = 30;
  stdout.writes = [];
  stdout.write = (value) => { stdout.writes.push(String(value)); return true; };
  return { stdin, stdout, processRef: new EventEmitter() };
}

test('Config previews use production Live and Manager renderers and stay cell-bounded', () => {
  const config = normalizeConfig({ ...DEFAULT_CONFIG, setupComplete: true, manager: { view: 'charts' } });
  for (const width of [48, 90, 160]) {
    const live = renderConfigPreview({ kind: 'live', config, width, height: 28, mode: 'mono', nowMs: 100_000 });
    const manager = renderConfigPreview({ kind: 'manager', config, width, height: 28, mode: 'mono', nowMs: 100_000 });
    assert.equal(live.source, 'renderDemo');
    assert.equal(manager.source, 'renderSessionDashboard');
    assert.match(live.lines.join('\n'), /LIVE CONFIG PREVIEW/);
    assert.match(manager.lines.join('\n'), /CONFIG PREVIEW/);
    assert.match(manager.lines.join('\n'), /CHARTS/);
    assert.ok(live.lines.every((line) => cellWidth(line) <= width));
    assert.ok(manager.lines.every((line) => cellWidth(line) <= width));
  }
});

test('Config preview shortcuts are exposed only by a host that declares preview capability', () => {
  assert.equal(normalizeManagerInput('p', { configOpen: true }), null);
  assert.equal(normalizeManagerInput('m', { configOpen: true }), null);
  assert.equal(normalizeManagerInput('p', { configOpen: true, configPreviewAvailable: true }), 'config-preview-live');
  assert.equal(normalizeManagerInput('m', { configOpen: true, configPreviewAvailable: true }), 'config-preview-manager');
  assert.equal(normalizeManagerInput('\x1b', { configPreviewOpen: true }), 'config-preview-close');
  assert.equal(normalizeManagerInput('m', { configPreviewOpen: true }), 'config-preview-manager');
});

test('future config version is rejected without modifying the original file', () => {
  const root = tempRoot();
  const filePath = path.join(root, 'config.json');
  try {
    const original = `${JSON.stringify({ configVersion: CONFIG_VERSION + 7, setupComplete: true, theme: 'matrix' }, null, 2)}\n`;
    fs.writeFileSync(filePath, original);
    const loaded = loadMonitorConfig({ filePath });
    assert.equal(loaded.valid, false);
    assert.equal(loaded.futureVersion, true);
    assert.equal(loaded.sourceVersion, CONFIG_VERSION + 7);
    assert.equal(loaded.error?.code, 'CONFIG_VERSION_UNSUPPORTED');
    assert.equal(loaded.config.setupComplete, false);
    assert.equal(fs.readFileSync(filePath, 'utf8'), original);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('atomic Config save failure preserves the previous config and cleans the temporary file', () => {
  const root = tempRoot();
  const filePath = path.join(root, 'config.json');
  const tempPath = `${filePath}.tmp`;
  try {
    const original = '{"sentinel":"old"}\n';
    fs.writeFileSync(filePath, original);
    const fsRef = {
      mkdirSync: fs.mkdirSync.bind(fs),
      writeFileSync: fs.writeFileSync.bind(fs),
      unlinkSync: fs.unlinkSync.bind(fs),
      renameSync() { throw Object.assign(new Error('rename denied'), { code: 'EACCES' }); }
    };
    assert.throws(() => saveMonitorConfig(normalizeConfig(DEFAULT_CONFIG), { filePath, fsRef }), /rename denied/);
    assert.equal(fs.readFileSync(filePath, 'utf8'), original);
    assert.equal(fs.existsSync(tempPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reset confirmation explains exact safety boundary and Archive consequence', () => {
  const text = renderResetConfirm({ width: 100, height: 24, mode: 'mono', archiveEnabled: true }).lines.join('\n');
  assert.match(text, /Codex login\/auth/);
  assert.match(text, /Codex sessions\/history/);
  assert.match(text, /Local Session Archive SQLite data/);
  assert.match(text, /background indexing will be disabled/i);
  assert.match(text, /not written until Config Save/i);
});

test('reset confirmation never blocks non-interactive environments', async () => {
  const result = await confirmMonitorReset({
    stdin: { isTTY: false },
    stdout: { isTTY: false, write() {} }
  });
  assert.equal(result.confirmed, false);
  assert.equal(result.code, 2);
  assert.match(result.error.message, /interactive TTY/);
});

test('standalone Config can preview the current draft and return without saving it', async () => {
  const { stdin, stdout, processRef } = fakeTty();
  let saves = 0;
  const config = normalizeConfig({ ...DEFAULT_CONFIG, setupComplete: true, theme: 'mono' });
  const promise = runStandaloneConfigTui({
    stdin,
    stdout,
    processRef,
    currentConfig: config,
    previousConfig: config,
    save() { saves += 1; throw new Error('preview must not save'); },
    colorCapability: 'mono',
    theme: 'mono'
  });
  setImmediate(() => {
    stdin.emit('data', 'p');
    stdin.emit('data', '\x1b');
    stdin.emit('data', '\x1b');
  });
  const result = await promise;
  assert.equal(result.saved, false);
  assert.equal(saves, 0);
  assert.match(stdout.writes.join(''), /LIVE CONFIG PREVIEW/);
});

test('standalone Config renders recovery notice without persisting anything', async () => {
  const { stdin, stdout, processRef } = fakeTty();
  const config = normalizeConfig(DEFAULT_CONFIG);
  const promise = runStandaloneConfigTui({
    stdin,
    stdout,
    processRef,
    currentConfig: config,
    previousConfig: config,
    notice: 'RECOVERY: original file preserved until explicit Save.',
    colorCapability: 'mono',
    theme: 'mono'
  });
  setImmediate(() => stdin.emit('data', '\x1b'));
  const result = await promise;
  assert.equal(result.saved, false);
  assert.match(stdout.writes.join(''), /RECOVERY: original file preserved until explicit Save/);
});
