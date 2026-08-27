import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { assertNoWrap, buildLiveFrame } from '../../src/ui/live-renderer-responsive.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

const DEFAULT_SEED = 0x5eed1234;
const ITERATIONS = Math.max(2_000, Number(process.env.CODEXM_PHASE5_FUZZ_ITERATIONS) || 4_000);
const seed = Number(process.env.CODEXM_PHASE5_FUZZ_SEED) || DEFAULT_SEED;

function mulberry32(initial) {
  let value = initial >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(seed);
const pick = (values) => values[Math.floor(random() * values.length)];
const chance = (p = 0.5) => random() < p;

const ALL_HEADER = ['activity', 'model', 'reasoning', 'project', 'git', 'auth', 'health', 'session-age'];
const STATES = ['idle', 'thinking', 'tool', 'approval', 'error'];
const THEMES = ['color', 'mono', 'matrix'];
const BACKGROUNDS = ['terminal', 'black', 'dark'];
const PRESETS = ['recommended', 'compact', 'full', 'custom'];
const AUTH = ['login', 'api', 'unknown'];
const PROJECTS = ['Codex-Monitor', 'Màn hình CLI', 'Dự án 🙂', '東京-tools', 'repo-Δ', 'VI 🇻🇳 EN'];

function randomSubset(values, { max = values.length } = {}) {
  const shuffled = [...values].sort(() => random() - 0.5);
  const count = Math.floor(random() * (Math.min(max, values.length) + 1));
  return shuffled.slice(0, count);
}

function randomConfig() {
  const preset = pick(PRESETS);
  const base = configForPreset(preset);
  const sections = {};
  for (const key of ['context', 'usage', 'session', 'activity', 'system']) sections[key] = chance();
  if (!Object.values(sections).some(Boolean)) sections.activity = true;

  const metrics = { ...base.metrics };
  for (const key of Object.keys(metrics)) metrics[key] = chance(0.7);

  return normalizeConfig({
    ...base,
    preset: 'custom',
    theme: pick(THEMES),
    background: pick(BACKGROUNDS),
    sections,
    metrics,
    header: randomSubset(ALL_HEADER, { max: 4 })
  });
}

function rendererBudget(height) {
  return Math.max(3, Math.min(16, Math.max(8, Number(height) || 24) - 8));
}

test(`Phase 05 deterministic layout fuzz seed=${seed} iterations=${ITERATIONS}`, () => {
  for (let index = 0; index < ITERATIONS; index += 1) {
    const width = 20 + Math.floor(random() * 201);
    const height = 8 + Math.floor(random() * 73);
    const config = randomConfig();
    const stateKind = pick(STATES);
    const authMode = pick(AUTH);
    const nowMs = 1_800_000_000_000 + index;
    const state = createDemoState(stateKind, { authMode, nowMs });

    let frame;
    try {
      frame = buildLiveFrame({
        state,
        config,
        width,
        height,
        projectName: pick(PROJECTS),
        nowMs,
        health: pick(['WAITING', 'OK', 'LONG', 'HIGH', 'PRESSURE'])
      });
    } catch (error) {
      error.message += `\nPhase 05 fuzz reproduction: CODEXM_PHASE5_FUZZ_SEED=${seed} iteration=${index} width=${width} height=${height}`;
      throw error;
    }

    assert.equal(assertNoWrap(frame, width), true, `wrap seed=${seed} i=${index} ${width}x${height}`);
    assert.equal(frame.rowCount, frame.lines.length, `row count mismatch seed=${seed} i=${index}`);
    assert.ok(frame.lines.length <= rendererBudget(height), `row budget seed=${seed} i=${index}`);
    assert.ok(frame.rowCount >= 1, `empty frame seed=${seed} i=${index}`);
    assert.ok(frame.layout.columns >= 0 && frame.layout.columns <= 6, `column count seed=${seed} i=${index}`);
    assert.ok(frame.layout.cardCount >= 0 && frame.layout.cardCount <= 6, `card count seed=${seed} i=${index}`);
    assert.ok(frame.lines.every((line) => cellWidth(line) <= width), `cell width seed=${seed} i=${index}`);
    assert.equal(frame.semantic.interactive, false, `passive contract seed=${seed} i=${index}`);
    assert.equal(frame.semantic.cardGrid, true, `card-grid contract seed=${seed} i=${index}`);

    const text = stripAnsi(frame.lines.join('\n'));
    assert.match(text, /CODEX MONITOR/i, `title lost seed=${seed} i=${index}`);
    assert.doesNotMatch(text, /\[overview\]|Alt\+←\/→|F4 History|Ctrl\+G|F2|F3/i, `dead Live navigation leaked seed=${seed} i=${index}`);
  }
});
