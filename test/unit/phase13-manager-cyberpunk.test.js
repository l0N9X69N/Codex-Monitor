import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_VALUES, normalizeConfig } from '../../src/config/schema.js';
import { OnboardingController, ONBOARDING_STEP } from '../../src/config/onboarding.js';
import { hpaint, historyTokens } from '../../src/history/theme.js';
import { managerColorCapability } from '../../src/manager/portable-tui.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';
import { themeTokens } from '../../src/ui/theme.js';

const TITLES = Object.freeze([
  ['TOKEN BURN', 'cyberCyan'],
  ['CURRENT / LIVE', 'cyberGreen'],
  ['TOP CONTEXT', 'cyberAmber'],
  ['SELECTED SESSION', 'cyberMagenta']
]);

test('Color and Cyberpunk remain distinct first-class Monitor themes', () => {
  assert.equal(CONFIG_VALUES.themes.has('color'), true);
  assert.equal(CONFIG_VALUES.themes.has('cyberpunk'), true);
  assert.equal(normalizeConfig({ theme: 'cyberpunk' }).theme, 'cyberpunk');
  assert.equal(themeTokens('color').name, 'color');
  assert.equal(themeTokens('cyberpunk').name, 'cyberpunk');
  assert.notEqual(themeTokens('color').frame, themeTokens('cyberpunk').frame);
  assert.notEqual(themeTokens('color').nav, themeTokens('cyberpunk').nav);

  const color = historyTokens('truecolor');
  const cyberpunk = historyTokens('cyberpunk:truecolor');
  assert.notEqual(color.panel, cyberpunk.panel);
  assert.notEqual(color.selected, cyberpunk.selected);
  assert.notEqual(color.cyberMagenta, cyberpunk.cyberMagenta);
});

test('Cyberpunk Manager palette exposes distinct neon semantic accents', () => {
  const tokens = historyTokens('cyberpunk:truecolor');
  for (const token of ['cyberCyan', 'cyberMagenta', 'cyberAmber', 'cyberGreen']) {
    assert.match(tokens[token], /^\x1b\[/);
  }
  assert.equal(new Set(TITLES.map(([, token]) => tokens[token])).size, TITLES.length);
  assert.match(tokens.panel, /^\x1b\[/);
  assert.match(tokens.selected, /48;2;/);
});

test('Manager headings keep semantic accents in both Color and Cyberpunk without changing cells', () => {
  for (const mode of ['truecolor', 'cyberpunk:truecolor']) {
    const tokens = historyTokens(mode);
    for (const [title, token] of TITLES) {
      const rendered = hpaint(title, 'heading', mode);
      assert.ok(rendered.startsWith(tokens[token]), `${mode}/${title} should use ${token}`);
      assert.equal(stripAnsi(rendered), title);
      assert.equal(cellWidth(rendered), cellWidth(title));
    }
    const manager = hpaint('CODEX // SESSION MANAGER', 'strong', mode);
    assert.ok(manager.startsWith(tokens.cyberCyan));
  }
});

test('Manager footer highlights command keys while descriptions stay intact', () => {
  const plain = '↑↓ select  Enter inspect  / search  F scope  S sort  D dir  V view  Q/Esc quit';
  for (const mode of ['truecolor', 'cyberpunk:truecolor']) {
    const tokens = historyTokens(mode);
    const rendered = hpaint(plain, 'dim', mode);
    assert.equal(stripAnsi(rendered), plain);
    assert.ok(rendered.includes(tokens.cyberCyan));
    assert.ok(rendered.includes(tokens.cyberMagenta));
    assert.equal(cellWidth(rendered), cellWidth(plain));
  }
});

test('first-run Appearance cycles from Color to Cyberpunk', () => {
  const controller = new OnboardingController({ currentConfig: normalizeConfig({ theme: 'color' }) });
  controller.step = ONBOARDING_STEP.APPEARANCE;
  controller.cursorIndex = 0;
  assert.equal(controller.currentRow().id, 'theme');
  assert.equal(controller.currentRow().value, 'Color');
  controller.activateCurrent(1);
  assert.equal(controller.draftConfig.theme, 'cyberpunk');
  assert.equal(controller.currentRow().value, 'Cyberpunk');
});

test('portable Manager routes Cyberpunk through terminal color capability', () => {
  assert.equal(managerColorCapability({ theme: 'color', colorCapability: 'truecolor' }), 'truecolor');
  assert.equal(managerColorCapability({ theme: 'cyberpunk', colorCapability: 'truecolor' }), 'cyberpunk:truecolor');
  assert.equal(managerColorCapability({ monitorConfig: { theme: 'cyberpunk' }, colorCapability: '256' }), 'cyberpunk:256');
  assert.equal(managerColorCapability({ theme: 'cyberpunk', colorCapability: 'mono' }), 'mono');
});

test('mono Manager presentation remains ANSI-free and structurally identical', () => {
  for (const [title] of TITLES) assert.equal(hpaint(title, 'heading', 'mono'), title);
  const footer = '↑↓ select  Enter inspect  / search  V view  Q quit';
  assert.equal(hpaint(footer, 'dim', 'mono'), footer);
  assert.doesNotMatch(hpaint('selected row', 'selected', 'mono'), /\x1b\[/);
});
