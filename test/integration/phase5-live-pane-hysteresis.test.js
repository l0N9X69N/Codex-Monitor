import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { LivePaneController } from '../../src/runtime/live-pane.js';

function fakeStdout({ columns = 80, rows = 35 } = {}) {
  return {
    columns,
    rows,
    writes: [],
    write(data) { this.writes.push(String(data)); return true; }
  };
}

test('LivePane carries previous lane count through resize jitter', () => {
  const stdout = fakeStdout({ columns: 80, rows: 35 });
  const state = createDemoState('idle', { authMode: 'login', nowMs: 1000 });
  const config = normalizeConfig(configForPreset('recommended'));
  const pane = new LivePaneController({ stdout, state, config, now: () => 1000, hysteresisCells: 4 });

  const initial = pane.render({ force: true });
  assert.equal(initial.frame.layout.laneCount, 1);

  stdout.columns = 85;
  const nearThreshold = pane.render({ force: true });
  assert.equal(nearThreshold.frame.layout.laneCount, 1);

  stdout.columns = 90;
  const crossed = pane.render({ force: true });
  assert.equal(crossed.frame.layout.laneCount, 2);

  stdout.columns = 83;
  const jitterBack = pane.render({ force: true });
  assert.equal(jitterBack.frame.layout.laneCount, 2);

  stdout.columns = 75;
  const clearlyNarrow = pane.render({ force: true });
  assert.equal(clearlyNarrow.frame.layout.laneCount, 1);

  pane.dispose({ clear: false });
});
