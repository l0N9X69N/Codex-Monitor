#!/usr/bin/env node
import process from 'node:process';
import { configForPreset, normalizeConfig } from '../src/config/schema.js';
import { createDemoState } from '../src/ui/demo.js';
import { buildLiveFrame } from '../src/ui/live-renderer-responsive.js';
import { setMetric } from '../src/core/normalized-state.js';
import { PROVENANCE } from '../src/core/provenance.js';

const NOW = Date.parse('2026-08-25T12:00:00Z');

function metric(target, key, value, source = PROVENANCE.LOCAL) {
  setMetric(target, key, value, { source, observedAtMs: NOW, evidence: 'phase6-visual-stress' });
}

function samples({ cpuBase = 25, ramBase = 40, total = 32_000_000_000, count = 30 } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const cpuPercent = Math.max(1, Math.min(99, cpuBase + Math.sin(index / 2) * 12 + ((index % 5) - 2) * 2));
    const ramPercent = Math.max(1, Math.min(99, ramBase + Math.sin(index / 4) * 5));
    return {
      atMs: NOW - ((count - index) * 2000),
      cpuPercent,
      memoryBytes: total * (ramPercent / 100),
      totalMemoryBytes: total
    };
  });
}

function withSystemHistory(state, { cpu = 28, ram = 42, total = 32_000_000_000 } = {}) {
  metric(state.system, 'cpuPercent', cpu);
  metric(state.system, 'memoryBytes', total * (ram / 100));
  metric(state.system, 'totalMemoryBytes', total);
  metric(state.system, 'samples', samples({ cpuBase: cpu, ramBase: ram, total }));
  return state;
}

function allFalse(object) {
  return Object.fromEntries(Object.keys(object).map((key) => [key, false]));
}

function configForCase({ preset = 'full', theme = 'color', background = 'terminal', sections = null, fields = null, header = null } = {}) {
  const base = configForPreset(preset);
  return normalizeConfig({
    ...base,
    preset,
    theme,
    background,
    sections: sections ?? base.sections,
    fields: fields ?? base.fields,
    header: header ?? base.header
  });
}

const CASES = {
  'color-login-5col': {
    width: 220, height: 50, auth: 'login', state: 'idle',
    config: () => configForCase({ theme: 'color', background: 'terminal' })
  },
  'mono-black-5col': {
    width: 220, height: 50, auth: 'login', state: 'thinking',
    config: () => configForCase({ theme: 'mono', background: 'black' })
  },
  'matrix-dark-5col': {
    width: 220, height: 50, auth: 'login', state: 'tool',
    config: () => configForCase({ theme: 'matrix', background: 'dark' })
  },
  'api-color-5col': {
    width: 220, height: 50, auth: 'api', state: 'idle',
    config: () => configForCase({ theme: 'color', background: 'terminal' })
  },
  'layout-4col': {
    width: 160, height: 45, auth: 'login', state: 'idle', config: () => configForCase()
  },
  'layout-3col': {
    width: 130, height: 45, auth: 'login', state: 'idle', config: () => configForCase()
  },
  'layout-2col': {
    width: 100, height: 45, auth: 'login', state: 'idle', config: () => configForCase()
  },
  'layout-1col': {
    width: 60, height: 50, auth: 'login', state: 'idle', config: () => configForCase()
  },
  'fields-5-1-0': {
    width: 180, height: 45, auth: 'login', state: 'idle',
    config: () => {
      const base = configForCase();
      return normalizeConfig({
        ...base,
        preset: 'custom',
        fields: {
          ...base.fields,
          context: { used: true, gauge: true, cache: true, left: true, compaction: true },
          usage: { ...allFalse(base.fields.usage), weekly: true },
          session: allFalse(base.fields.session),
          activity: { ...allFalse(base.fields.activity), state: true, tools: true },
          system: { cpu: true, ram: true, ramCapacity: true }
        }
      });
    }
  },
  'fields-empty-cards': {
    width: 180, height: 45, auth: 'login', state: 'idle',
    config: () => {
      const base = configForCase();
      return normalizeConfig({
        ...base,
        preset: 'custom',
        fields: Object.fromEntries(Object.entries(base.fields).map(([section, values]) => [section, allFalse(values)]))
      });
    }
  },
  'sections-weird': {
    width: 130, height: 40, auth: 'login', state: 'approval',
    config: () => configForCase({
      preset: 'custom',
      sections: { context: true, usage: false, session: true, activity: true, system: false },
      header: ['activity', 'health', 'session-age']
    })
  },
  'missing-data': {
    width: 180, height: 45, auth: 'login', state: 'idle', config: () => configForCase(),
    mutate(state) {
      metric(state.quota, 'fiveHour', null, PROVENANCE.OFFICIAL_CURRENT);
      metric(state.system, 'cpuPercent', null);
      metric(state.session, 'threadId', null, PROVENANCE.OFFICIAL_CURRENT);
      return state;
    }
  },
  'severity-mixed': {
    width: 220, height: 50, auth: 'login', state: 'thinking', config: () => configForCase(),
    mutate(state) {
      metric(state.context, 'usedPercent', 88, PROVENANCE.DERIVED);
      metric(state.context, 'leftPercent', 12, PROVENANCE.DERIVED);
      metric(state.quota, 'fiveHour', { remainingPercent: 15, resetsAt: '38m' }, PROVENANCE.OFFICIAL_CURRENT);
      metric(state.quota, 'weekly', { remainingPercent: 42, resetsAt: '4d02h' }, PROVENANCE.OFFICIAL_CURRENT);
      return withSystemHistory(state, { cpu: 92, ram: 78, total: 32_000_000_000 });
    }
  },
  'severity-critical': {
    width: 220, height: 50, auth: 'login', state: 'error', config: () => configForCase(),
    mutate(state) {
      metric(state.context, 'usedPercent', 95, PROVENANCE.DERIVED);
      metric(state.context, 'leftPercent', 5, PROVENANCE.DERIVED);
      metric(state.quota, 'fiveHour', { remainingPercent: 8, resetsAt: '12m' }, PROVENANCE.OFFICIAL_CURRENT);
      metric(state.quota, 'weekly', { remainingPercent: 12, resetsAt: '1d03h' }, PROVENANCE.OFFICIAL_CURRENT);
      return withSystemHistory(state, { cpu: 94, ram: 93, total: 32_000_000_000 });
    }
  },
  'short-terminal': {
    width: 120, height: 18, auth: 'login', state: 'tool', config: () => configForCase()
  }
};

function parseArgs(argv) {
  const result = { list: false, caseName: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--list') result.list = true;
    else if (argv[i] === '--case') { result.caseName = argv[i + 1] ?? null; i += 1; }
    else if (argv[i].startsWith('--case=')) result.caseName = argv[i].slice('--case='.length);
  }
  return result;
}

function renderCase(name, spec) {
  let state = createDemoState(spec.state, { authMode: spec.auth, nowMs: NOW });
  state = withSystemHistory(state);
  if (spec.mutate) state = spec.mutate(state) ?? state;
  const config = spec.config();
  const frame = buildLiveFrame({ state, config, width: spec.width, height: spec.height, nowMs: NOW, projectName: 'Stress Case' });
  process.stdout.write(`\n=== ${name} · ${spec.width}x${spec.height} · ${spec.auth} · ${config.theme}/${config.background} ===\n`);
  process.stdout.write(`${frame.lines.join('\n')}\n`);
  process.stdout.write(`semantic: columns=${frame.semantic.columns} cap=${frame.semantic.representationCap} rows=${frame.rowCount}\n`);
}

const args = parseArgs(process.argv.slice(2));
if (args.list) {
  process.stdout.write(`${Object.keys(CASES).join('\n')}\n`);
  process.exit(0);
}
if (args.caseName) {
  const spec = CASES[args.caseName];
  if (!spec) {
    process.stderr.write(`Unknown case: ${args.caseName}\nUse --list to see available cases.\n`);
    process.exit(2);
  }
  renderCase(args.caseName, spec);
} else {
  for (const [name, spec] of Object.entries(CASES)) renderCase(name, spec);
}
