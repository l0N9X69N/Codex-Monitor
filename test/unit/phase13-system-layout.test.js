import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, configForPreset, migrateConfig, normalizeConfig } from '../../src/config/schema.js';
import { OnboardingController, ONBOARDING_STEP } from '../../src/config/onboarding.js';
import { ManagerConfigController } from '../../src/manager/config-controller.js';
import { createDemoState } from '../../src/ui/demo.js';
import { stripAnsi } from '../../src/ui/cell-width.js';
import { buildLiveFrame, SYSTEM_CARD_MIN_OUTER_CELLS } from '../../src/ui/live-renderer-responsive.js';

const NOW = Date.parse('2026-08-28T00:00:00Z');

function state() {
  return createDemoState('idle', { authMode: 'login', nowMs: NOW });
}

function textOf(frame) {
  return stripAnsi(frame.lines.join('\n'));
}

test('Recommended uses automatic System while Full forces it and Compact disables it', () => {
  assert.equal(normalizeConfig(DEFAULT_CONFIG).systemMode, 'auto');
  assert.equal(normalizeConfig(configForPreset('recommended')).systemMode, 'auto');
  assert.equal(normalizeConfig(configForPreset('full')).systemMode, 'on');
  assert.equal(normalizeConfig(configForPreset('compact')).systemMode, 'off');
});

test('v3 Recommended forced System migrates to automatic while Custom forced System is preserved', () => {
  const recommended = migrateConfig({
    ...configForPreset('recommended'),
    configVersion: 3,
    setupComplete: true,
    preset: 'recommended',
    systemMode: 'on'
  }, { existing: true });
  assert.equal(recommended.configVersion, 4);
  assert.equal(recommended.systemMode, 'auto');

  const custom = migrateConfig({
    ...configForPreset('recommended'),
    configVersion: 3,
    setupComplete: true,
    preset: 'custom',
    systemMode: 'on'
  }, { existing: true });
  assert.equal(custom.configVersion, 4);
  assert.equal(custom.systemMode, 'on');
});

test('automatic System requires one row and its own minimum width instead of squeezing core cards', () => {
  const config = normalizeConfig({ ...configForPreset('recommended'), beastMode: 'off' });

  const laptop = buildLiveFrame({ state: state(), config, width: 180, height: 50, nowMs: NOW });
  assert.equal(laptop.semantic.systemMode, 'auto');
  assert.equal(laptop.semantic.systemVisible, false);
  assert.equal(laptop.semantic.cardCount, 4);
  assert.equal(laptop.layout.gridRows, 1);
  assert.equal(laptop.semantic.systemMinOuterCells, SYSTEM_CARD_MIN_OUTER_CELLS);
  assert.match(laptop.semantic.systemWidthDecision, /below-min-width|auto-needs-one-row/);
  assert.doesNotMatch(textOf(laptop), /\bSYSTEM\b/);

  const wide = buildLiveFrame({ state: state(), config, width: 260, height: 50, nowMs: NOW });
  assert.equal(wide.semantic.systemMode, 'auto');
  assert.equal(wide.semantic.systemVisible, true);
  assert.equal(wide.layout.gridRows, 1);
  assert.equal(wide.semantic.cardCount, 5);
  assert.equal(wide.semantic.systemWidthDecision, 'fits');
});

test('automatic System CPU RAM and USED use equal quota-style gauges', () => {
  const config = normalizeConfig({ ...configForPreset('recommended'), beastMode: 'off' });
  const frame = buildLiveFrame({ state: state(), config, width: 260, height: 50, nowMs: NOW });
  const text = textOf(frame);
  const cpu = text.match(/CPU\s+([━─]{6,16})\s+\d+%/);
  const ram = text.match(/RAM\s+([━─]{6,16})\s+\d+%/);
  const used = text.match(/USED\s+([━─]{6,16})\s+\d+%\s+·\s+[\d.]+ [KMGTP]?B\/[\d.]+ [KMGTP]?B/);
  assert.ok(cpu, 'CPU gauge missing');
  assert.ok(ram, 'RAM gauge missing');
  assert.ok(used, 'USED gauge missing');
  assert.equal(cpu[1].length, ram[1].length);
  assert.equal(ram[1].length, used[1].length);
});

test('forced System remains visible and may wrap when one row is not wide enough', () => {
  const config = normalizeConfig({ ...configForPreset('recommended'), preset: 'custom', systemMode: 'on', beastMode: 'off' });
  const frame = buildLiveFrame({ state: state(), config, width: 160, height: 50, nowMs: NOW });
  assert.equal(frame.semantic.systemMode, 'on');
  assert.equal(frame.semantic.systemVisible, true);
  assert.equal(frame.semantic.systemWidthDecision, 'forced-on');
  assert.equal(frame.semantic.cardCount, 5);
  assert.ok(frame.layout.gridRows > 1);
});

test('explicitly enabling the System card in Manager Custom config forces mode on', () => {
  const config = normalizeConfig({
    ...configForPreset('custom'),
    systemMode: 'off',
    sections: { ...DEFAULT_CONFIG.sections, system: false },
    metrics: { ...DEFAULT_CONFIG.metrics, system: false }
  });
  const controller = new ManagerConfigController({ config });
  controller.moveTab(1);
  const index = controller.rows().findIndex((row) => row.id === 'card:system');
  assert.ok(index >= 0);
  controller.cursorIndex = index;
  controller.editCurrent();
  assert.equal(controller.draftConfig.preset, 'custom');
  assert.equal(controller.draftConfig.systemMode, 'on');
  assert.equal(controller.draftConfig.sections.system, true);
  assert.equal(controller.draftConfig.metrics.system, true);
});

test('explicitly enabling System in Custom onboarding forces mode on', () => {
  const config = normalizeConfig({
    ...configForPreset('custom'),
    systemMode: 'off',
    sections: { ...DEFAULT_CONFIG.sections, system: false },
    metrics: { ...DEFAULT_CONFIG.metrics, system: false }
  });
  const controller = new OnboardingController({ currentConfig: config, previousConfig: config });
  controller.step = ONBOARDING_STEP.CUSTOM_SECTIONS;
  const index = controller.rows().findIndex((row) => row.id === 'section:system');
  assert.ok(index >= 0);
  controller.cursorIndex = index;
  controller.activateCurrent();
  assert.equal(controller.draftConfig.systemMode, 'on');
  assert.equal(controller.draftConfig.sections.system, true);
  assert.equal(controller.draftConfig.metrics.system, true);
});
