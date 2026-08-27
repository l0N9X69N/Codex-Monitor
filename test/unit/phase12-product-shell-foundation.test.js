import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMonitorArgs } from '../../src/cli/args.js';
import { runStandaloneConfigTui } from '../../src/config/tui.js';
import {
  applyRuntimeOverrides,
  CONFIG_VERSION,
  DEFAULT_CONFIG,
  migrateConfig,
  normalizeConfig
} from '../../src/config/schema.js';
import { loadMonitorConfig } from '../../src/config/store.js';
import { ManagerConfigController } from '../../src/manager/config-controller.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase12-foundation-'));
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

  const processRef = new EventEmitter();
  return { stdin, stdout, processRef };
}

test('Phase 12 router consumes Manager view and rejects ambiguous Monitor actions', () => {
  const parsed = parseMonitorArgs(['--theme', 'matrix', '--manager-view=charts', '--manager']);
  assert.equal(parsed.action, 'manager');
  assert.equal(parsed.overrides.theme, 'matrix');
  assert.equal(parsed.overrides.managerView, 'charts');
  assert.deepEqual(parsed.codexArgs, []);
  assert.throws(() => parseMonitorArgs(['--doctor', '--manager']), /Conflicting Monitor actions/);
  assert.throws(() => parseMonitorArgs(['--manager-view', 'table']), /requires --manager/);
});

test('Phase 12 router preserves unknown Codex args and the exact passthrough escape hatch', () => {
  const parsed = parseMonitorArgs(['resume', '--last', '--', '--manager', '--theme', 'matrix']);
  assert.equal(parsed.action, 'run');
  assert.deepEqual(parsed.codexArgs, ['resume', '--last', '--manager', '--theme', 'matrix']);
});

test('existing v2 config migrates to setup-complete Manager preferences without enabling Archive', () => {
  const old = {
    configVersion: 2,
    language: 'en',
    preset: 'compact',
    theme: 'matrix',
    archive: { enabled: false, retention: 'forever', sizeLimitBytes: null, autoCleanup: false }
  };
  const migrated = migrateConfig(old, { existing: true });
  assert.equal(migrated.configVersion, CONFIG_VERSION);
  assert.equal(migrated.setupComplete, true);
  assert.equal(migrated.manager.view, 'operations');
  assert.equal(migrated.archive.enabled, false);
  assert.equal(migrated.language, 'en');
  assert.equal(migrated.theme, 'matrix');
});

test('clean defaults remain setup-incomplete for first-run detection', () => {
  const clean = normalizeConfig(DEFAULT_CONFIG);
  assert.equal(clean.configVersion, CONFIG_VERSION);
  assert.equal(clean.setupComplete, false);
  assert.equal(clean.manager.view, 'operations');
  assert.equal(clean.archive.enabled, false);
});

test('loading an old config returns an effective migration without rewriting the source file', () => {
  const root = tempRoot();
  const filePath = path.join(root, 'config.json');
  try {
    const oldText = `${JSON.stringify({ configVersion: 2, preset: 'recommended', archive: { enabled: false } }, null, 2)}\n`;
    fs.writeFileSync(filePath, oldText);
    const loaded = loadMonitorConfig({ filePath });
    assert.equal(loaded.exists, true);
    assert.equal(loaded.valid, true);
    assert.equal(loaded.needsMigration, true);
    assert.equal(loaded.config.setupComplete, true);
    assert.equal(loaded.config.manager.view, 'operations');
    assert.equal(fs.readFileSync(filePath, 'utf8'), oldText);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('malformed config is preserved and reported instead of being silently overwritten', () => {
  const root = tempRoot();
  const filePath = path.join(root, 'config.json');
  try {
    fs.writeFileSync(filePath, '{broken-json');
    const loaded = loadMonitorConfig({ filePath });
    assert.equal(loaded.exists, true);
    assert.equal(loaded.valid, false);
    assert.ok(loaded.error);
    assert.equal(fs.readFileSync(filePath, 'utf8'), '{broken-json');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Manager one-shot view override does not mutate the persisted config object', () => {
  const persisted = normalizeConfig({ ...DEFAULT_CONFIG, setupComplete: true, manager: { view: 'operations' } });
  const effective = applyRuntimeOverrides(persisted, { managerView: 'charts' });
  assert.equal(effective.manager.view, 'charts');
  assert.equal(persisted.manager.view, 'operations');
});

test('shared Config controller persists Manager default view and explicit Save completes setup', () => {
  const writes = [];
  const controller = new ManagerConfigController({
    config: normalizeConfig(DEFAULT_CONFIG),
    filePath: '/virtual/config.json',
    save(next) {
      writes.push(normalizeConfig(next));
      return { config: normalizeConfig(next), filePath: '/virtual/config.json' };
    },
    applyArchiveEffects() { return { changed: false, ok: true }; }
  });
  controller.moveTab(7);
  assert.equal(controller.activeTab, 'manager');
  assert.equal(controller.currentRow().id, 'manager:view');
  controller.editCurrent();
  assert.equal(controller.draftConfig.manager.view, 'table');
  const result = controller.save();
  assert.equal(result.saved, true);
  assert.equal(writes[0].setupComplete, true);
  assert.equal(writes[0].manager.view, 'table');
});

test('standalone Config refuses non-TTY input without prompting or saving', async () => {
  let saves = 0;
  const result = await runStandaloneConfigTui({
    stdin: { isTTY: false },
    stdout: { isTTY: false, write() {} },
    currentConfig: normalizeConfig(DEFAULT_CONFIG),
    save() { saves += 1; }
  });
  assert.equal(result.code, 2);
  assert.equal(result.saved, false);
  assert.equal(saves, 0);
  assert.match(result.error.message, /requires a TTY/);
});

test('standalone Config cancel leaves the previous config untouched', async () => {
  const { stdin, stdout, processRef } = fakeTty();
  let saves = 0;
  const previous = normalizeConfig({ ...DEFAULT_CONFIG, setupComplete: true, theme: 'matrix' });
  const promise = runStandaloneConfigTui({
    stdin,
    stdout,
    processRef,
    currentConfig: normalizeConfig({ ...previous, theme: 'color' }),
    previousConfig: previous,
    save() { saves += 1; throw new Error('cancel must not save'); },
    applyArchiveEffects() { throw new Error('cancel must not apply side effects'); },
    colorCapability: 'mono',
    theme: 'mono'
  });
  setImmediate(() => stdin.emit('data', '\x1b'));
  const result = await promise;
  assert.equal(result.code, 0);
  assert.equal(result.saved, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.config.theme, 'matrix');
  assert.equal(saves, 0);
});

test('reset-style shared Config applies defaults only after explicit Save', async () => {
  const { stdin, stdout, processRef } = fakeTty();
  const previous = normalizeConfig({
    ...DEFAULT_CONFIG,
    setupComplete: true,
    theme: 'matrix',
    manager: { view: 'charts' },
    archive: { ...DEFAULT_CONFIG.archive, enabled: true }
  });
  const saved = [];
  const transitions = [];
  const promise = runStandaloneConfigTui({
    stdin,
    stdout,
    processRef,
    currentConfig: normalizeConfig(DEFAULT_CONFIG),
    previousConfig: previous,
    save(next) {
      const config = normalizeConfig(next);
      saved.push(config);
      return { config, filePath: '/virtual/config.json' };
    },
    applyArchiveEffects(before, next) {
      transitions.push([before.archive.enabled, next.archive.enabled]);
      return { changed: true, transition: 'on-to-off', ok: true, error: null };
    },
    colorCapability: 'mono',
    theme: 'mono'
  });
  setImmediate(() => {
    stdin.emit('data', 's');
    stdin.emit('data', '\x1b');
  });
  const result = await promise;
  assert.equal(result.code, 0);
  assert.equal(result.saved, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].setupComplete, true);
  assert.equal(saved[0].theme, DEFAULT_CONFIG.theme);
  assert.equal(saved[0].manager.view, 'operations');
  assert.equal(saved[0].archive.enabled, false);
  assert.deepEqual(transitions, [[true, false]]);
});
