import test from 'node:test';
import assert from 'node:assert/strict';
import { configForPreset, normalizeConfig } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { buildLiveFrame } from '../../src/ui/live-renderer-responsive.js';
import { setMetric } from '../../src/core/normalized-state.js';
import { PROVENANCE } from '../../src/core/provenance.js';
import { stripAnsi } from '../../src/ui/cell-width.js';

const NOW = Date.parse('2026-08-26T00:00:00Z');

function render(state, config = normalizeConfig(configForPreset('full'))) {
  return stripAnsi(buildLiveFrame({ state, config, width: 220, height: 50, nowMs: NOW }).lines.join('\n'));
}

test('direct API shows MODEL without inventing ACTUAL or ROUTED', () => {
  const state = createDemoState('idle', { authMode: 'api', nowMs: NOW });
  const text = render(state);
  assert.match(text, /USAGE · API/);
  assert.match(text, /MODEL\s+gpt-/i);
  assert.doesNotMatch(text, /\bACTUAL\b/);
  assert.doesNotMatch(text, /\bROUTED\b/);
  assert.doesNotMatch(text, /waiting…/);
});

test('explicit model reroute evidence is presented as ROUTED', () => {
  const state = createDemoState('idle', { authMode: 'api', nowMs: NOW });
  setMetric(state.model, 'requested', 'codex-main', {
    source: PROVENANCE.OFFICIAL_CURRENT,
    observedAtMs: NOW,
    evidence: 'turn_context'
  });
  setMetric(state.model, 'actual', 'azure/gpt-5.6', {
    source: PROVENANCE.OFFICIAL_CURRENT,
    observedAtMs: NOW,
    evidence: 'model_reroute'
  });
  const text = render(state);
  assert.match(text, /MODEL\s+codex-main/);
  assert.match(text, /ROUTED\s+azure\/gpt-5\.6/);
  assert.doesNotMatch(text, /\bACTUAL\b/);
});

test('legacy usage.actual visibility migrates to routed visibility', () => {
  const base = configForPreset('full');
  const legacyUsage = {
    fiveHour: true,
    weekly: true,
    input: true,
    cache: true,
    output: true,
    reasoning: true,
    turnInput: true,
    turnOutput: true,
    model: true,
    actual: false
  };
  const config = normalizeConfig({
    ...base,
    fields: { ...base.fields, usage: legacyUsage }
  });
  assert.equal(config.fields.usage.routed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(config.fields.usage, 'actual'), false);
});
