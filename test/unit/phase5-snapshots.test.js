import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { buildLiveFrame } from '../../src/ui/live-renderer-responsive.js';
import { stripAnsi } from '../../src/ui/cell-width.js';

const NOW = Date.parse('2026-08-25T00:00:00Z');
const snapshots = JSON.parse(fs.readFileSync(new URL('../snapshots/phase5-live.json', import.meta.url), 'utf8'));

function canonicalLines(frame) {
  return frame.lines.map((line) => stripAnsi(line).trimEnd());
}

for (const [name, spec] of Object.entries(snapshots)) {
  test(`golden snapshot: ${name}`, () => {
    const config = normalizeConfig({ ...configForPreset(spec.preset), theme: spec.theme });
    const state = createDemoState(spec.stateKind, { authMode: spec.authMode, nowMs: NOW });
    const frame = buildLiveFrame({
      state,
      config,
      width: spec.width,
      height: spec.height,
      cwd: 'C:/repo/Codex Monitor',
      nowMs: NOW,
      health: 'OK'
    });
    assert.deepEqual(canonicalLines(frame), spec.lines);
    assert.equal(frame.semantic.interactive, false);
    assert.equal(frame.semantic.cardGrid, true);
  });
}

test('golden snapshot suite includes narrow, normal, wide and ultrawide representatives', () => {
  const widths = Object.values(snapshots).map((item) => item.width);
  assert.ok(Math.min(...widths) <= 40);
  assert.ok(widths.some((width) => width >= 80 && width < 120));
  assert.ok(widths.some((width) => width >= 120 && width < 160));
  assert.ok(Math.max(...widths) >= 160);
});
