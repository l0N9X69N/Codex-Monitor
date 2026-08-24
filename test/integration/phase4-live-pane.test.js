import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { LivePaneController } from '../../src/runtime/live-pane.js';

function fakeStdout({ columns = 100, rows = 30 } = {}) {
  return {
    columns,
    rows,
    writes: [],
    write(data) { this.writes.push(String(data)); return true; }
  };
}

test('live pane reserves monitor rows from child PTY height', () => {
  const stdout = fakeStdout({ columns: 100, rows: 30 });
  const state = createDemoState('tool', { nowMs: 1000 });
  const config = normalizeConfig(configForPreset('recommended'));
  const pane = new LivePaneController({ stdout, state, config, now: () => 1000 });
  const geometry = pane.geometry();
  assert.ok(geometry.monitorRows >= 3);
  assert.equal(geometry.childRows + geometry.monitorRows, 30);
  assert.equal(geometry.originRow, geometry.childRows + 1);
  pane.dispose({ clear: false });
});

test('same frame produces zero write until explicitly invalidated by PTY repaint', () => {
  const stdout = fakeStdout({ columns: 100, rows: 30 });
  const state = createDemoState('idle', { nowMs: 1000 });
  const config = normalizeConfig(configForPreset('recommended'));
  const pane = new LivePaneController({ stdout, state, config, now: () => 1000 });
  const first = pane.render({ force: true });
  const writesAfterFirst = stdout.writes.length;
  const second = pane.render();
  assert.equal(first.renderResult.written, true);
  assert.equal(second.renderResult.written, false);
  assert.equal(stdout.writes.length, writesAfterFirst);
  pane.dispose({ clear: false });
});

test('resize debounce repaints atomically and reports new child geometry', () => {
  const stdout = fakeStdout({ columns: 80, rows: 24 });
  const state = createDemoState('idle', { nowMs: 1000 });
  const config = normalizeConfig(configForPreset('recommended'));
  const timers = [];
  const pane = new LivePaneController({
    stdout,
    state,
    config,
    now: () => 1000,
    setTimer(fn, delay) { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimer(timer) { timer.cleared = true; }
  });
  pane.render({ force: true });
  stdout.columns = 140;
  stdout.rows = 40;
  let reported = null;
  pane.onResize((geometry) => { reported = geometry; });
  const timer = timers.at(-1);
  assert.equal(timer.delay, 75);
  timer.fn();
  assert.equal(reported.width, 140);
  assert.equal(reported.height, 40);
  assert.equal(reported.childRows + reported.monitorRows, 40);
  pane.dispose({ clear: false });
});

test('dispose clears reserved HUD rows without leaking timers', () => {
  const stdout = fakeStdout({ columns: 80, rows: 24 });
  const state = createDemoState('idle', { nowMs: 1000 });
  const config = normalizeConfig(configForPreset('recommended'));
  const pane = new LivePaneController({ stdout, state, config, now: () => 1000 });
  pane.render({ force: true });
  const before = stdout.writes.length;
  pane.dispose();
  assert.ok(stdout.writes.length > before);
  assert.equal(pane.timer, null);
  assert.equal(pane.resizeTimer, null);
});
