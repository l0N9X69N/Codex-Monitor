import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, configForPreset, normalizeConfig } from '../../src/config/schema.js';
import { OnboardingController, ONBOARDING_STEP } from '../../src/config/onboarding.js';
import { ManagerConfigController } from '../../src/manager/config-controller.js';
import { createDemoState } from '../../src/ui/demo.js';
import { buildLiveFrame } from '../../src/ui/live-renderer-responsive.js';

const NOW = Date.parse('2026-08-28T00:00:00Z');

function state() {
  return createDemoState('idle', { authMode: 'login', nowMs: NOW });
}

test('Recommended uses automatic System while Full forces it and Compact disables it', () => {
  assert.equal(normalizeConfig(DEFAULT_CONFIG).systemMode, 'auto');
  assert.equal(normalizeConfig(configForPreset('recommended')).systemMode, 'auto');
  assert.equal(normalizeConfig(configForPreset('full')).systemMode, 'on');
  assert.equal(normalizeConfig(configForPreset('compact')).systemMode, 'off');
});

test('automatic System appears only when all cards still fit on one row', () => {
  const config = normalizeConfig({ ...configForPreset('recommended'), beastMode: 'off' });

  const wide = buildLiveFrame({ state: state(), config, width: 180, height: 50, nowMs: NOW });
  assert.equal(wide.semantic.systemMode, 'auto');
  assert.equal(wide.semantic.systemVisible, true);
  assert.equal(wide.layout.gridRows, 1);
  assert.equal(wide.semantic.cardCount, 5);

  const narrow = buildLiveFrame({ state: state(), config, width: 160, height: 50, nowMs: NOW });
  assert.equal(narrow.semantic.systemMode, 'auto');
  assert.equal(narrow.semantic.systemVisible, false);
  assert.equal(narrow.layout.gridRows, 1);
  assert.equal(narrow.semantic.cardCount, 4);
});

test('forced System remains visible and may wrap when one row is not wide enough', () => {
  const config = normalizeConfig({ ...configForPreset('recommended'), preset: 'custom', systemMode: 'on', beastMode: 'off' });
  const frame = buildLiveFrame({ state: state(), config, width: 160, height: 50, nowMs: NOW });
  assert.equal(frame.semantic.systemMode, 'on');
  assert.equal(frame.semantic.systemVisible, true);
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
