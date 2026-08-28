import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../../src/config/schema.js';
import { OnboardingController, ONBOARDING_STEP, shouldRunFirstRunOnboarding } from '../../src/config/onboarding.js';
import { renderOnboarding } from '../../src/config/onboarding-render.js';
import { runFirstRunOnboarding } from '../../src/config/onboarding-tui.js';

function loaded({ setupComplete = false, valid = true, exists = false } = {}) {
  return {
    valid,
    exists,
    config: normalizeConfig({ ...DEFAULT_CONFIG, setupComplete })
  };
}

test('first-run policy only prompts interactive product-runtime actions', () => {
  assert.equal(shouldRunFirstRunOnboarding({ action: 'run', interactive: true, loaded: loaded() }), true);
  assert.equal(shouldRunFirstRunOnboarding({ action: 'manager', interactive: true, loaded: loaded() }), true);
  assert.equal(shouldRunFirstRunOnboarding({ action: 'run', interactive: false, loaded: loaded() }), false);
  for (const action of ['help', 'monitor-version', 'config', 'config-path', 'doctor', 'demo', 'configure', 'reset']) {
    assert.equal(shouldRunFirstRunOnboarding({ action, interactive: true, loaded: loaded() }), false, action);
  }
});

test('existing setup-complete config skips onboarding while malformed config can recover interactively', () => {
  assert.equal(shouldRunFirstRunOnboarding({ action: 'run', interactive: true, loaded: loaded({ setupComplete: true, exists: true }) }), false);
  assert.equal(shouldRunFirstRunOnboarding({ action: 'run', interactive: true, loaded: loaded({ valid: false, exists: true }) }), true);
});

test('onboarding recommended path stays in memory until explicit summary Save', () => {
  const saves = [];
  const controller = new OnboardingController({
    currentConfig: normalizeConfig(DEFAULT_CONFIG),
    previousConfig: normalizeConfig(DEFAULT_CONFIG),
    filePath: '/virtual/config.json',
    save(next) {
      const config = normalizeConfig(next);
      saves.push(config);
      return { config, filePath: '/virtual/config.json' };
    },
    applyArchiveEffects() { return { changed: false, ok: true }; }
  });

  assert.equal(controller.step, ONBOARDING_STEP.WELCOME);
  controller.activateCurrent();
  assert.equal(controller.step, ONBOARDING_STEP.LANGUAGE);
  controller.moveCursor(1);
  controller.activateCurrent();
  assert.equal(controller.draftConfig.language, 'en');
  assert.equal(controller.step, ONBOARDING_STEP.PRESET);
  controller.activateCurrent();
  assert.equal(controller.draftConfig.preset, 'recommended');
  assert.equal(controller.step, ONBOARDING_STEP.APPEARANCE);
  controller.moveCursor(2);
  controller.activateCurrent();
  assert.equal(controller.step, ONBOARDING_STEP.MANAGER);
  controller.moveCursor(2);
  controller.activateCurrent();
  assert.equal(controller.draftConfig.manager.view, 'charts');
  assert.equal(controller.step, ONBOARDING_STEP.SUMMARY);
  assert.equal(saves.length, 0);
  assert.equal(controller.draftConfig.setupComplete, false);

  const result = controller.activateCurrent();
  assert.equal(result.saved, true);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].setupComplete, true);
  assert.equal(saves[0].language, 'en');
  assert.equal(saves[0].manager.view, 'charts');
  assert.equal(saves[0].archive.enabled, false);
});

test('Custom onboarding exposes sections, display, header and fields before appearance', () => {
  const controller = new OnboardingController({ currentConfig: normalizeConfig(DEFAULT_CONFIG) });
  controller.activateCurrent();
  controller.activateCurrent();
  controller.moveCursor(3);
  controller.activateCurrent();
  assert.equal(controller.step, ONBOARDING_STEP.CUSTOM_SECTIONS);
  assert.ok(controller.rows().some((row) => row.id === 'section:context'));
  assert.ok(controller.rows().some((row) => row.id === 'section:system'));

  controller.cursorIndex = controller.rows().length - 1;
  controller.activateCurrent();
  assert.equal(controller.step, ONBOARDING_STEP.CUSTOM_DISPLAY);
  assert.deepEqual(controller.rows().slice(0, 2).map((row) => row.id), ['systemMode', 'beastMode']);

  controller.cursorIndex = controller.rows().length - 1;
  controller.activateCurrent();
  assert.equal(controller.step, ONBOARDING_STEP.CUSTOM_HEADER);
  assert.ok(controller.rows().some((row) => row.id === 'header:activity'));

  controller.cursorIndex = controller.rows().length - 1;
  controller.activateCurrent();
  assert.equal(controller.step, ONBOARDING_STEP.CUSTOM_FIELDS);
  assert.ok(controller.rows().some((row) => row.id === 'field:context:used'));
  assert.ok(controller.rows().some((row) => row.id === 'field:activity:approval'));
});

test('onboarding cancel never saves or applies Archive side effects', () => {
  let saves = 0;
  let effects = 0;
  const previous = normalizeConfig({ ...DEFAULT_CONFIG, setupComplete: false, theme: 'matrix' });
  const controller = new OnboardingController({
    currentConfig: previous,
    previousConfig: previous,
    save() { saves += 1; throw new Error('must not save'); },
    applyArchiveEffects() { effects += 1; throw new Error('must not apply'); }
  });
  controller.activateCurrent();
  controller.moveCursor(1);
  const result = controller.cancel();
  assert.equal(result.saved, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.config.theme, 'matrix');
  assert.equal(saves, 0);
  assert.equal(effects, 0);
});

test('English onboarding renderer keeps explicit no-write promise and Archive disabled summary', () => {
  const english = normalizeConfig({ ...DEFAULT_CONFIG, language: 'en' });
  const controller = new OnboardingController({ currentConfig: english, previousConfig: english });
  const welcome = renderOnboarding({ controller, width: 100, height: 28, mode: 'mono' }).lines.join('\n');
  assert.match(welcome, /INITIAL SETUP/);
  assert.match(welcome, /No preference is written until explicit Save/);

  controller.step = ONBOARDING_STEP.SUMMARY;
  const summary = renderOnboarding({ controller, width: 100, height: 28, mode: 'mono' }).lines.join('\n');
  assert.match(summary, /READY TO SAVE/);
  assert.match(summary, /Archive\s+Disabled/);
  assert.match(summary, /Enter\s+Save and continue/);
});

test('Vietnamese onboarding renderer changes guidance after choosing Vietnamese', () => {
  const vietnamese = normalizeConfig({ ...DEFAULT_CONFIG, language: 'vi' });
  const controller = new OnboardingController({ currentConfig: vietnamese, previousConfig: vietnamese });
  const welcome = renderOnboarding({ controller, width: 110, height: 28, mode: 'mono' }).lines.join('\n');
  assert.match(welcome, /Chào mừng/);
  assert.match(welcome, /Không tùy chọn nào được ghi xuống/);

  controller.activateCurrent();
  const language = renderOnboarding({ controller, width: 110, height: 28, mode: 'mono' }).lines.join('\n');
  assert.match(language, /Ngôn ngữ/);
  assert.match(language, /Tiếng Việt/);

  controller.step = ONBOARDING_STEP.SUMMARY;
  const summary = renderOnboarding({ controller, width: 110, height: 28, mode: 'mono' }).lines.join('\n');
  assert.match(summary, /SẴN SÀNG LƯU/);
  assert.match(summary, /Lưu trữ\s+Tắt/);
  assert.match(summary, /Enter\s+Lưu và tiếp tục/);
});

test('onboarding TUI is a no-op in non-interactive environments', async () => {
  let saves = 0;
  const result = await runFirstRunOnboarding({
    stdin: { isTTY: false },
    stdout: { isTTY: false, write() {} },
    currentConfig: normalizeConfig(DEFAULT_CONFIG),
    save() { saves += 1; }
  });
  assert.equal(result.skipped, true);
  assert.equal(result.saved, false);
  assert.equal(result.code, 0);
  assert.equal(saves, 0);
});
