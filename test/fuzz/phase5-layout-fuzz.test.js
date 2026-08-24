import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, configForPreset } from '../../src/config/schema.js';
import { createDemoState } from '../../src/ui/demo.js';
import { assertNoWrap, buildLiveFrame } from '../../src/ui/live-renderer.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';
import { monitorRowBudget } from '../../src/ui/layout.js';

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

const ALL_HEADER = ['activity', 'model', 'reasoning', 'project', 'git', 'auth', 'health', 'session-age', 'fast'];
const ALL_TABS = ['overview', 'performance', 'processes', 'tools', 'resources', 'usage'];
const STATES = ['idle', 'thinking', 'tool', 'approval', 'error'];
const THEMES = ['color', 'mono', 'matrix'];
const PRESETS = ['recommended', 'compact', 'full', 'custom'];
const AUTH = ['login', 'api', 'unknown'];
const PROJECTS = ['Codex-Monitor', 'Màn hình CLI', 'Dự án 🙂', '東京-tools', 'repo-Δ', 'VI 🇻🇳 EN'];

function randomSubset(values, { max = values.length, atLeastOne = false } = {}) {
  const shuffled = [...values].sort(() => random() - 0.5);
  const min = atLeastOne ? 1 : 0;
  const count = min + Math.floor(random() * (Math.min(max, values.length) - min + 1));
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
    sections,
    metrics,
    header: randomSubset(ALL_HEADER, { max: 4 }),
    tabs: randomSubset(ALL_TABS, { atLeastOne: true })
  });
}

function hasCompleteSgr(line) {
  const starts = [...line.matchAll(/\x1b\[[0-9;]*m/g)].map((match) => match[0]);
  if (!starts.length) return true;
  const nonReset = starts.filter((code) => code !== '\x1b[0m').length;
  const resets = starts.filter((code) => code === '\x1b[0m').length;
  return resets >= nonReset || !line.includes('\x1b[');
}

test(`Phase 05 deterministic layout fuzz seed=${seed} iterations=${ITERATIONS}`, () => {
  let previousLaneCount = null;
  for (let index = 0; index < ITERATIONS; index += 1) {
    const width = 20 + Math.floor(random() * 201);
    const height = 8 + Math.floor(random() * 73);
    const config = randomConfig();
    const activeTab = pick(config.tabs);
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
        activeTab,
        projectName: pick(PROJECTS),
        nowMs,
        health: pick(['WAITING', 'OK', 'LONG', 'HIGH', 'PRESSURE']),
        previousLaneCount,
        hysteresisCells: 4
      });
    } catch (error) {
      error.message += `\nPhase 05 fuzz reproduction: CODEXM_PHASE5_FUZZ_SEED=${seed} iteration=${index} width=${width} height=${height}`;
      throw error;
    }

    previousLaneCount = frame.layout.laneCount;
    assert.equal(assertNoWrap(frame, width), true, `wrap seed=${seed} i=${index} ${width}x${height}`);
    assert.ok(frame.lines.length <= monitorRowBudget(height), `row budget seed=${seed} i=${index}`);
    assert.ok(frame.rowCount >= 1, `empty frame seed=${seed} i=${index}`);
    assert.ok(frame.layout.laneCount >= 1 && frame.layout.laneCount <= 3, `lane count seed=${seed} i=${index}`);
    assert.ok(frame.layout.lanes.every((lane) => lane.width > 0 && lane.rows >= 0 && lane.rows <= frame.layout.maxRows), `lane invariant seed=${seed} i=${index}`);
    assert.ok(frame.lines.every((line) => cellWidth(line) <= width), `cell width seed=${seed} i=${index}`);
    assert.ok(frame.lines.every(hasCompleteSgr), `ANSI reset seed=${seed} i=${index}`);

    const header = stripAnsi(frame.lines[0] ?? '');
    const activeNames = [activeTab, { overview: 'Ov', performance: 'Perf', processes: 'Proc', resources: 'Res', usage: 'Use', tools: 'Tools' }[activeTab]].filter(Boolean);
    assert.ok(activeNames.some((name) => header.toLowerCase().includes(String(name).toLowerCase())), `navigation lost seed=${seed} i=${index} active=${activeTab} header=${header}`);
  }
});
