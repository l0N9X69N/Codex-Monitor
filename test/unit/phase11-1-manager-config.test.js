import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../../src/config/schema.js';
import {
  MANAGER_CONFIG_TABS,
  ManagerConfigController
} from '../../src/manager/config-controller.js';
import { renderManagerConfig } from '../../src/manager/config-render.js';

function config(enabled = false) {
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    archive: { ...DEFAULT_CONFIG.archive, enabled }
  });
}

test('Manager Config exposes the canonical nine top-level tabs', () => {
  assert.deepEqual(MANAGER_CONFIG_TABS, [
    'live-view',
    'cards',
    'fields',
    'header',
    'companion',
    'appearance',
    'archive',
    'manager',
    'updates'
  ]);
});

test('Manager Config edits a draft and revert restores saved config', () => {
  const controller = new ManagerConfigController({ config: config(false), filePath: '/tmp/config.json' });
  assert.equal(controller.dirty, false);
  controller.moveTab(6);
  assert.equal(controller.activeTab, 'archive');
  assert.equal(controller.currentRow().id, 'archive:enabled');
  controller.editCurrent();
  assert.equal(controller.draftConfig.archive.enabled, true);
  assert.equal(controller.dirty, true);
  controller.revert();
  assert.equal(controller.draftConfig.archive.enabled, false);
  assert.equal(controller.dirty, false);
});

test('Manager Config save uses the same archive transition engine as CLI configure', () => {
  const order = [];
  const saved = [];
  const controller = new ManagerConfigController({
    config: config(false),
    filePath: '/virtual/config.json',
    save(next, { filePath }) {
      order.push('save');
      saved.push({ next, filePath });
      return { config: normalizeConfig(next), filePath };
    },
    applyArchiveEffects(before, next) {
      order.push('archive-effects');
      assert.equal(before.archive.enabled, false);
      assert.equal(next.archive.enabled, true);
      return { changed: true, transition: 'off-to-on', ok: true, error: null };
    }
  });

  controller.moveTab(6);
  controller.editCurrent();
  const result = controller.save();
  assert.deepEqual(order, ['save', 'archive-effects']);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].filePath, '/virtual/config.json');
  assert.equal(result.saved, true);
  assert.equal(controller.dirty, false);
  assert.match(controller.status, /Archive enabled/);
});

test('Manager Config keeps non-schema future tabs informational instead of inventing persistence', () => {
  const controller = new ManagerConfigController({ config: config(false) });
  controller.moveTab(4);
  assert.equal(controller.activeTab, 'companion');
  assert.equal(controller.currentRow().editable, false);
  assert.equal(controller.editCurrent(), false);
  controller.moveTab(3);
  assert.equal(controller.activeTab, 'manager');
  assert.equal(controller.currentRow().editable, false);
});

test('Manager Config renderer is a standalone screen with Archive controls and config-specific footer', () => {
  const controller = new ManagerConfigController({ config: config(true) });
  controller.moveTab(6);
  const frame = renderManagerConfig({ controller, width: 100, height: 24, mode: 'mono' });
  const text = frame.lines.join('\n');
  assert.match(text, /CODEX MONITOR · CONFIG/);
  assert.match(text, /Archive/);
  assert.match(text, /S save/);
  assert.match(text, /same lifecycle engine/);
  assert.equal(frame.activeTab, 'archive');
});
