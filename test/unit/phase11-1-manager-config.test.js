import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../../src/config/schema.js';
import { ArchiveConfigPanel } from '../../src/manager/archive-config-panel.js';
import {
  MANAGER_CONFIG_TABS,
  ManagerConfigController
} from '../../src/manager/config-controller.js';
import { renderManagerConfig } from '../../src/manager/config-render.js';

function config(enabled = false, language = 'en') {
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    language,
    archive: { ...DEFAULT_CONFIG.archive, enabled }
  });
}

function panel(overrides = {}) {
  return new ArchiveConfigPanel({
    readHealth: () => ({
      serviceRunning: false,
      hookInstalled: true,
      hookComplete: true,
      sqliteHealthy: true,
      syncLabel: 'READY',
      sessions: 3,
      suppressions: 0,
      pendingFiles: 0,
      pendingBytes: 0,
      display: { watcher: 'now', database: '12.0 KB', lastReconcile: 'now', pendingBytes: '0 B' }
    }),
    reconcile: () => ({ ok: true, reason: 'wake-requested' }),
    compact: () => ({ ok: true, reason: 'compacted' }),
    repairHook: () => ({ ok: true }),
    clear: () => ({ ok: true, cleared: 3, suppressed: 3 }),
    ...overrides
  });
}

test('Manager Config exposes the canonical nine top-level tabs', () => {
  assert.deepEqual(MANAGER_CONFIG_TABS, [
    'live-view', 'cards', 'fields', 'header', 'companion', 'appearance', 'archive', 'manager', 'updates'
  ]);
});

test('Manager Config edits a draft and revert restores saved config', () => {
  const controller = new ManagerConfigController({ config: config(false), filePath: '/tmp/config.json', archivePanel: panel() });
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
    archivePanel: panel(),
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
  assert.equal(saved[0].next.setupComplete, true);
  assert.equal(result.saved, true);
  assert.equal(controller.dirty, false);
  assert.match(controller.status, /Archive enabled/);
});

test('Archive Config exposes health, reconcile, compact, hook repair and double-confirm clear actions', () => {
  let clears = 0;
  const archivePanel = panel({ clear: () => { clears += 1; return { ok: true, cleared: 3, suppressed: 3 }; } });
  const controller = new ManagerConfigController({ config: config(true), archivePanel });
  controller.moveTab(6);
  const rows = controller.rows();
  assert.ok(rows.some((row) => row.id === 'archive:health:service' && row.value === 'Idle'));
  assert.ok(rows.some((row) => row.id === 'archive:health:hook' && row.value === 'Installed'));
  assert.ok(rows.some((row) => row.id === 'archive:action:reconcile'));
  assert.ok(rows.some((row) => row.id === 'archive:action:compact'));
  assert.ok(rows.some((row) => row.id === 'archive:action:repair-hook'));

  controller.cursorEnd();
  assert.equal(controller.currentRow().id, 'archive:action:clear');
  assert.equal(controller.editCurrent(), true);
  assert.equal(clears, 0);
  assert.match(controller.status, /press Enter\/Space again/i);
  assert.equal(controller.currentRow().value, 'CONFIRM AGAIN');
  assert.equal(controller.editCurrent(), true);
  assert.equal(clears, 1);
});

test('Companion remains informational while Manager tab owns the persisted default view', () => {
  const controller = new ManagerConfigController({ config: config(false), archivePanel: panel() });
  controller.moveTab(4);
  assert.equal(controller.activeTab, 'companion');
  assert.equal(controller.currentRow().editable, false);
  assert.equal(controller.editCurrent(), false);
  controller.moveTab(3);
  assert.equal(controller.activeTab, 'manager');
  assert.equal(controller.currentRow().id, 'manager:view');
  assert.equal(controller.currentRow().editable, true);
  assert.equal(controller.currentRow().value, 'operations');
  controller.editCurrent();
  assert.equal(controller.draftConfig.manager.view, 'table');
});

test('Manager Config renderer is a standalone screen with Archive health/actions and config-specific footer', () => {
  const controller = new ManagerConfigController({ config: config(true), archivePanel: panel() });
  controller.moveTab(6);
  const frame = renderManagerConfig({ controller, width: 100, height: 30, mode: 'mono' });
  const text = frame.lines.join('\n');
  assert.match(text, /CODEX MONITOR · CONFIG/);
  assert.match(text, /\[x\] Archive/);
  assert.match(text, /local SQLite/);
  assert.match(text, /Service/);
  assert.match(text, /Reconcile Now/);
  assert.match(text, /S save/);
  assert.match(text, /same lifecycle engine/);
  assert.equal(frame.activeTab, 'archive');
});

test('boolean Config choices render as descriptive checkboxes and toggle with Enter/Space semantics', () => {
  const controller = new ManagerConfigController({ config: config(false), archivePanel: panel() });
  controller.moveTab(1);
  assert.equal(controller.activeTab, 'cards');
  const before = controller.rows()[0];
  assert.equal(before.kind, 'toggle');
  assert.equal(before.label, 'Context');
  assert.equal(typeof before.checked, 'boolean');
  assert.match(before.description, /context-window pressure/i);

  const frameBefore = renderManagerConfig({ controller, width: 140, height: 30, mode: 'mono' });
  assert.match(frameBefore.lines.join('\n'), /\[[ x]\] Context\s+\(Show context-window pressure, remaining capacity, cache reuse, and compactions\.\)/);

  const oldValue = controller.draftConfig.sections.context;
  controller.editCurrent();
  assert.equal(controller.draftConfig.sections.context, !oldValue);
  const frameAfter = renderManagerConfig({ controller, width: 140, height: 30, mode: 'mono' });
  assert.match(frameAfter.lines.join('\n'), oldValue ? /\[ \] Context/ : /\[x\] Context/);
});

test('Fields explain what each metric means and align descriptions into one column', () => {
  const controller = new ManagerConfigController({ config: config(false), archivePanel: panel() });
  controller.moveTab(2);
  assert.equal(controller.activeTab, 'fields');

  const rows = controller.rows();
  const used = rows.find((row) => row.id === 'field:context:used');
  const updateAge = rows.find((row) => row.id === 'field:session:update');
  const approval = rows.find((row) => row.id === 'field:activity:approval');
  assert.match(used.description, /context window is already occupied/i);
  assert.match(updateAge.description, /latest session event/i);
  assert.match(approval.description, /waiting for user approval/i);
  assert.equal(rows.some((row) => /Show this metric/i.test(row.description ?? '')), false);

  const frame = renderManagerConfig({ controller, width: 180, height: 50, mode: 'mono' });
  const fieldLines = frame.lines.filter((line) => /\[[ x]\] (CONTEXT|USAGE|SESSION|ACTIVITY|SYSTEM) ·/.test(line));
  const starts = fieldLines.slice(0, 12).map((line) => line.indexOf('  ('));
  assert.ok(starts.length >= 10);
  assert.ok(starts.every((start) => start === starts[0] && start > 0));
});

test('Vietnamese Config keeps canonical English UI vocabulary and localizes explanations', () => {
  const controller = new ManagerConfigController({ config: config(false, 'vi'), archivePanel: panel() });

  controller.moveTab(3);
  let frame = renderManagerConfig({ controller, width: 180, height: 30, mode: 'mono' });
  let text = frame.lines.join('\n');
  assert.match(text, /\[Header\]/);
  assert.match(text, /\[x\] Activity/);
  assert.match(text, /Trạng thái Codex hiện tại/);
  assert.doesNotMatch(text, /\[Thanh đầu\]/);
  assert.doesNotMatch(text, /\[x\] Hoạt động/);

  controller.moveTab(-2);
  frame = renderManagerConfig({ controller, width: 180, height: 30, mode: 'mono' });
  text = frame.lines.join('\n');
  assert.match(text, /\[Cards\]/);
  assert.match(text, /\[[ x]\] Context/);
  assert.match(text, /Hiển thị áp lực cửa sổ context/);

  controller.moveTab(4);
  frame = renderManagerConfig({ controller, width: 180, height: 30, mode: 'mono' });
  text = frame.lines.join('\n');
  assert.match(text, /\[Appearance\]/);
  assert.match(text, /Theme/);
  assert.match(text, /Background/);
  assert.match(text, /Language/);
  assert.match(text, /Chọn cách phối màu terminal/);

  assert.match(text, /đổi tab|chọn|thay đổi/);
});

test('Vietnamese Fields keep canonical English metric names while localizing explanations', () => {
  const controller = new ManagerConfigController({ config: config(false, 'vi'), archivePanel: panel() });
  controller.moveTab(2);
  const frame = renderManagerConfig({ controller, width: 180, height: 50, mode: 'mono' });
  const text = frame.lines.join('\n');

  assert.match(text, /CONTEXT · Used % \/ tokens/);
  assert.match(text, /USAGE · Weekly quota/);
  assert.match(text, /SESSION · Elapsed/);
  assert.match(text, /ACTIVITY · Approval/);
  assert.match(text, /SYSTEM · RAM capacity/);
  assert.match(text, /Phần cửa sổ context của model đã sử dụng/);
  assert.match(text, /Hạn mức Codex tuần còn lại/);
  assert.doesNotMatch(text, /CONTEXT · % \/ token đã dùng/);
  assert.doesNotMatch(text, /USAGE · Hạn mức tuần/);
});

test('Config footer hotkeys use visible semantic accents in cyberpunk mode', () => {
  const controller = new ManagerConfigController({ config: config(false, 'vi'), archivePanel: panel() });
  const frame = renderManagerConfig({ controller, width: 180, height: 30, mode: 'cyberpunk:256', previewAvailable: true });
  const footer = frame.lines.slice(-2).join('\n');

  assert.match(footer, /\x1b\[1;38;5;45mTab\/←\/→\x1b\[0m/);
  assert.match(footer, /\x1b\[1;38;5;84mP\x1b\[0m/);
  assert.match(footer, /\x1b\[1;38;5;213mM\x1b\[0m/);
  assert.match(footer, /\x1b\[1;38;5;156mR\x1b\[0m/);
  assert.match(footer, /\x1b\[38;5;255mđổi tab\x1b\[0m/);
});
