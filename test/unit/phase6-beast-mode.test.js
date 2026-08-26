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

test('Beast Mode stays absent on the normal five-card width', () => {
  const frame = render(220);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.semantic.cardCount, 5);
  assert.equal(frame.semantic.beastMode, false);
  assert.equal(frame.semantic.columns, 5);
  assert.doesNotMatch(text, /BEAST MODE/);
});

test('Beast Mode appears as an empty sixth card only on ultrawide terminals', () => {
  const frame = render(BEAST_MODE_MIN_CELLS);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.semantic.cardCount, 6);
  assert.equal(frame.semantic.beastMode, true);
  assert.equal(frame.semantic.columns, 6);
  assert.match(text, /BEAST MODE/);
});

test('Custom config can disable Beast Mode even when terminal is ultrawide', () => {
  const base = normalizeConfig(configForPreset('full'));
  const config = normalizeConfig({
    ...base,
    preset: 'custom',
    sections: { ...base.sections, beast: false }
  });
  const frame = render(320, config);
  const text = stripAnsi(frame.lines.join('\n'));
  assert.equal(frame.semantic.cardCount, 5);
  assert.equal(frame.semantic.beastMode, false);
  assert.doesNotMatch(text, /BEAST MODE/);
});
