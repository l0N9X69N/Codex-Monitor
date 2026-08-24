const VALID = Object.freeze({
  languages: new Set(['vi', 'en']),
  presets: new Set(['recommended', 'compact', 'full', 'custom']),
  themes: new Set(['color', 'mono', 'matrix']),
  backgrounds: new Set(['terminal', 'black', 'dark']),
  tabs: new Set(['overview', 'performance', 'processes', 'tools', 'resources', 'usage']),
  header: new Set(['activity', 'model', 'reasoning', 'project', 'git', 'auth', 'health', 'session-age', 'fast']),
  sections: new Set(['context', 'usage', 'session', 'activity', 'system']),
  metrics: new Set([
    'activity', 'model', 'reasoning', 'project', 'context', 'usage', 'quota', 'session',
    'health', 'freshness', 'system', 'tools', 'resources', 'performance', 'processes',
    'gitBranch', 'gitDiff', 'gitAheadBehind'
  ])
});

const PRESET_DEFINITIONS = Object.freeze({
  recommended: Object.freeze({
    sections: Object.freeze({ context: true, usage: true, session: true, activity: true, system: false }),
    metrics: Object.freeze({
      activity: true, model: true, reasoning: true, project: true, context: true, usage: true,
      quota: true, session: true, health: true, freshness: true, system: false, tools: true,
      resources: true, performance: false, processes: false, gitBranch: false, gitDiff: false,
      gitAheadBehind: false
    }),
    header: Object.freeze(['activity', 'model', 'reasoning', 'project']),
    tabs: Object.freeze(['overview', 'tools', 'resources'])
  }),
  compact: Object.freeze({
    sections: Object.freeze({ context: true, usage: true, session: true, activity: true, system: false }),
    metrics: Object.freeze({
      activity: true, model: true, reasoning: false, project: true, context: true, usage: true,
      quota: true, session: true, health: false, freshness: true, system: false, tools: true,
      resources: false, performance: false, processes: false, gitBranch: false, gitDiff: false,
      gitAheadBehind: false
    }),
    header: Object.freeze(['activity', 'model', 'project']),
    tabs: Object.freeze(['overview', 'tools'])
  }),
  full: Object.freeze({
    sections: Object.freeze({ context: true, usage: true, session: true, activity: true, system: true }),
    metrics: Object.freeze({
      activity: true, model: true, reasoning: true, project: true, context: true, usage: true,
      quota: true, session: true, health: true, freshness: true, system: true, tools: true,
      resources: true, performance: true, processes: true, gitBranch: true, gitDiff: true,
      gitAheadBehind: true
    }),
    header: Object.freeze(['activity', 'model', 'reasoning', 'project']),
    tabs: Object.freeze(['overview', 'performance', 'processes', 'tools', 'resources', 'usage'])
  })
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function booleanMap(input, keys, fallback) {
  const result = {};
  for (const key of keys) {
    const value = input?.[key];
    result[key] = typeof value === 'boolean' ? value : Boolean(fallback?.[key]);
  }
  return result;
}

function uniqueValid(values, valid, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  return [...new Set(source.filter((value) => valid.has(value)))];
}

export const DEFAULT_CONFIG = Object.freeze({
  configVersion: 1,
  language: 'vi',
  preset: 'recommended',
  theme: 'color',
  background: 'terminal',
  layout: 'auto',
  sections: PRESET_DEFINITIONS.recommended.sections,
  metrics: PRESET_DEFINITIONS.recommended.metrics,
  header: PRESET_DEFINITIONS.recommended.header,
  tabs: PRESET_DEFINITIONS.recommended.tabs,
  updateCheck: true
});

export function configForPreset(preset = 'recommended', base = DEFAULT_CONFIG) {
  const normalizedPreset = VALID.presets.has(preset) ? preset : 'recommended';
  const presetDefinition = normalizedPreset === 'custom'
    ? null
    : PRESET_DEFINITIONS[normalizedPreset];

  const next = clone(base);
  next.preset = normalizedPreset;
  if (presetDefinition) {
    next.sections = clone(presetDefinition.sections);
    next.metrics = clone(presetDefinition.metrics);
    next.header = [...presetDefinition.header];
    next.tabs = [...presetDefinition.tabs];
  }
  return next;
}

export function normalizeConfig(input = {}, { base = DEFAULT_CONFIG } = {}) {
  const requestedPreset = VALID.presets.has(input?.preset) ? input.preset : base.preset;
  const presetBase = configForPreset(requestedPreset, base);
  const sectionKeys = [...VALID.sections];
  const metricKeys = [...VALID.metrics];

  const config = {
    configVersion: 1,
    language: VALID.languages.has(input?.language) ? input.language : presetBase.language,
    preset: requestedPreset,
    theme: VALID.themes.has(input?.theme) ? input.theme : presetBase.theme,
    background: VALID.backgrounds.has(input?.background) ? input.background : presetBase.background,
    layout: 'auto',
    sections: booleanMap(input?.sections, sectionKeys, presetBase.sections),
    metrics: booleanMap(input?.metrics, metricKeys, presetBase.metrics),
    header: uniqueValid(input?.header, VALID.header, presetBase.header).slice(0, 4),
    tabs: uniqueValid(input?.tabs, VALID.tabs, presetBase.tabs),
    updateCheck: typeof input?.updateCheck === 'boolean' ? input.updateCheck : Boolean(presetBase.updateCheck)
  };

  if (config.tabs.length === 0) config.tabs = ['overview'];
  return config;
}

export function applyRuntimeOverrides(config, overrides = {}) {
  let next = normalizeConfig(config);
  if (overrides.preset && VALID.presets.has(overrides.preset)) {
    next = normalizeConfig(configForPreset(overrides.preset, next));
  }
  if (overrides.theme && VALID.themes.has(overrides.theme)) next.theme = overrides.theme;
  if (overrides.language && VALID.languages.has(overrides.language)) next.language = overrides.language;
  return next;
}

export function validateChoice(kind, value) {
  const set = VALID[kind];
  return Boolean(set?.has(value));
}

export { PRESET_DEFINITIONS, VALID as CONFIG_VALUES };
