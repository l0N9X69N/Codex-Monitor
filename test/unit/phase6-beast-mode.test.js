import test from 'node:test';
import assert from 'node:assert/strict';
import { configForPreset, normalizeConfig } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { BEAST_MODE_MIN_CELLS, buildLiveFrame } from '../../src/ui/live-renderer-responsive.js';
import { stripAnsi } from '../../src/ui/cell-width.js';

const NOW = Date.parse('2026-08-25T00:00:00Z');

function render(width, config = normalizeConfig(configForPreset('full'))) {
  const state = createDemoState('idle', { authMode: 'login', nowMs: NOW });
  return buildLiveFrame({ state, config, width, height: 50, nowMs: NOW });
}

test('Full defaults Beast Mode to auto and keeps it absent on normal five-card width', () => {
  const config = normalizeConfig(configForPreset('full'));
  const frame = render(220, config);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(config.beastMode, 'auto');
  assert.equal(frame.semantic.cardCount, 5);
  assert.equal(frame.semantic.beastMode, 'auto');
  assert.equal(frame.semantic.beastVisible, false);
  assert.equal(frame.semantic.columns, 5);
  assert.doesNotMatch(text, /BEAST MODE/);
});

test('auto Beast Mode appears as an empty sixth card only on ultrawide terminals', () => {
  const frame = render(BEAST_MODE_MIN_CELLS);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.semantic.cardCount, 6);
  assert.equal(frame.semantic.beastMode, 'auto');
  assert.equal(frame.semantic.beastVisible, true);
  assert.equal(frame.semantic.columns, 6);
  assert.match(text, /BEAST MODE/);
});

test('on Beast Mode is a real selected card and can replace a disabled data card at five-column width', () => {
  const base = normalizeConfig(configForPreset('full'));
  const config = normalizeConfig({
    ...base,
    preset: 'custom',
    beastMode: 'on',
    sections: { ...base.sections, session: false },
    metrics: { ...base.metrics, session: false }
  });
  const frame = render(180, config);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.semantic.cardCount, 5);
  assert.equal(frame.semantic.columns, 5);
  assert.equal(frame.semantic.beastMode, 'on');
  assert.equal(frame.semantic.beastVisible, true);
  assert.match(text, /BEAST MODE/);
  assert.doesNotMatch(text, /\bSESSION\b/);
});

test('off Beast Mode stays hidden even on ultrawide terminals', () => {
  const base = normalizeConfig(configForPreset('full'));
  const config = normalizeConfig({ ...base, preset: 'custom', beastMode: 'off' });
  const frame = render(320, config);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.semantic.cardCount, 5);
  assert.equal(frame.semantic.beastMode, 'off');
  assert.equal(frame.semantic.beastVisible, false);
  assert.doesNotMatch(text, /BEAST MODE/);
});

test('legacy boolean sections.beast migrates to the old opportunistic behavior', () => {
  assert.equal(normalizeConfig({ preset: 'custom', sections: { beast: true } }).beastMode, 'auto');
  assert.equal(normalizeConfig({ preset: 'custom', sections: { beast: false } }).beastMode, 'off');
});
