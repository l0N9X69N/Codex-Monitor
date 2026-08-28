import test from 'node:test';
import assert from 'node:assert/strict';
import { configForPreset, normalizeConfig } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { buildLiveFrame } from '../../src/ui/live-renderer-responsive.js';
import { stripAnsi } from '../../src/ui/cell-width.js';

const NOW = Date.parse('2026-08-25T00:00:00Z');

function render(width, config = normalizeConfig(configForPreset('full'))) {
  const state = createDemoState('idle', { authMode: 'login', nowMs: NOW });
  return buildLiveFrame({ state, config, width, height: 50, nowMs: NOW });
}

test('Full temporarily defaults both System and Beast to on for Phase 6 testing', () => {
  const config = normalizeConfig(configForPreset('full'));
  const frame = render(220, config);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(config.systemMode, 'on');
  assert.equal(config.beastMode, 'on');
  assert.equal(frame.semantic.cardCount, 6);
  assert.equal(frame.semantic.columns, 6);
  assert.equal(frame.semantic.systemVisible, true);
  assert.equal(frame.semantic.beastVisible, true);
  assert.match(text, /SYSTEM/);
  assert.match(text, /BEAST MODE/);
});

test('on System plus on Beast reflows six cards as four plus two instead of five plus one', () => {
  const frame = render(180);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.semantic.cardCount, 6);
  assert.equal(frame.semantic.columns, 4);
  assert.equal(frame.layout.gridRows, 2);
  assert.equal(frame.semantic.systemVisible, true);
  assert.equal(frame.semantic.beastVisible, true);
  assert.match(text, /SYSTEM/);
  assert.match(text, /BEAST MODE/);
});

test('auto cards use spare horizontal slots while System still honors its minimum width', () => {
  const base = normalizeConfig(configForPreset('full'));
  const config = normalizeConfig({ ...base, preset: 'custom', systemMode: 'auto', beastMode: 'auto' });

  const medium = render(180, config);
  const mediumText = stripAnsi(medium.lines.join('\n'));
  assert.equal(medium.semantic.cardCount, 5);
  assert.equal(medium.semantic.systemVisible, false);
  assert.equal(medium.semantic.beastVisible, true);
  assert.doesNotMatch(mediumText, /SYSTEM/);
  assert.match(mediumText, /BEAST MODE/);

  const stillTight = render(220, config);
  const stillTightText = stripAnsi(stillTight.lines.join('\n'));
  assert.equal(stillTight.semantic.systemVisible, false);
  assert.equal(stillTight.semantic.beastVisible, true);
  assert.doesNotMatch(stillTightText, /SYSTEM/);
  assert.match(stillTightText, /BEAST MODE/);

  const wide = render(260, config);
  const wideText = stripAnsi(wide.lines.join('\n'));
  assert.equal(wide.semantic.cardCount, 6);
  assert.equal(wide.semantic.columns, 6);
  assert.equal(wide.semantic.systemVisible, true);
  assert.equal(wide.semantic.beastVisible, true);
  assert.match(wideText, /SYSTEM/);
  assert.match(wideText, /BEAST MODE/);
});

test('on Beast can replace a disabled data card while System is off', () => {
  const base = normalizeConfig(configForPreset('full'));
  const config = normalizeConfig({
    ...base,
    preset: 'custom',
    systemMode: 'off',
    beastMode: 'on',
    sections: { ...base.sections, session: false, system: false },
    metrics: { ...base.metrics, session: false, system: false }
  });
  const frame = render(180, config);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.semantic.cardCount, 4);
  assert.equal(frame.semantic.beastVisible, true);
  assert.equal(frame.semantic.systemVisible, false);
  assert.match(text, /BEAST MODE/);
  assert.doesNotMatch(text, /\bSESSION\b/);
  assert.doesNotMatch(text, /\bSYSTEM\b/);
});

test('off modes stay hidden even on ultrawide terminals', () => {
  const base = normalizeConfig(configForPreset('full'));
  const config = normalizeConfig({ ...base, preset: 'custom', systemMode: 'off', beastMode: 'off' });
  const frame = render(320, config);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.semantic.cardCount, 4);
  assert.equal(frame.semantic.systemVisible, false);
  assert.equal(frame.semantic.beastVisible, false);
  assert.doesNotMatch(text, /\bSYSTEM\b/);
  assert.doesNotMatch(text, /BEAST MODE/);
});

test('legacy boolean section contracts migrate without changing historical intent', () => {
  assert.equal(normalizeConfig({ preset: 'custom', sections: { beast: true } }).beastMode, 'auto');
  assert.equal(normalizeConfig({ preset: 'custom', sections: { beast: false } }).beastMode, 'off');
  assert.equal(normalizeConfig({ preset: 'custom', sections: { system: true } }).systemMode, 'on');
  assert.equal(normalizeConfig({ preset: 'custom', sections: { system: false } }).systemMode, 'off');
});
