import { DEFAULT_ARCHIVE_CONFIG } from '../archive/constants.js';

export const CONFIG_VERSION = 3;

const VALID = Object.freeze({
  languages: new Set(['vi', 'en']),
  presets: new Set(['recommended', 'compact', 'full', 'custom']),
  themes: new Set(['color', 'mono', 'matrix']),
  backgrounds: new Set(['terminal', 'black', 'dark']),
  beastModes: new Set(['off', 'auto', 'on']),
  systemModes: new Set(['off', 'auto', 'on']),
  managerViews: new Set(['operations', 'table', 'charts', 'auto']),
  archiveRetentions: new Set(['forever']),
  header: new Set(['activity', 'model', 'reasoning', 'project', 'git', 'auth', 'health', 'session-age']),
  sections: new Set(['context', 'usage', 'session', 'activity', 'system']),
  metrics: new Set([
    'activity', 'model', 'reasoning', 'project', 'context', 'usage', 'quota', 'session',
    'health', 'freshness', 'system', 'tools', 'gitBranch', 'gitDiff', 'gitAheadBehind'
  ])
});

export const DEFAULT_FIELD_VISIBILITY = Object.freeze({
  context: Object.freeze({ used: true, gauge: true, cache: true, left: true, compaction: true }),
  usage: Object.freeze({
    fiveHour: true, weekly: true, input: true, cache: true, output: true,
    reasoning: true, turnInput: true, turnOutput: true, model: true, routed: true
  }),
  session: Object.freeze({ elapsed: true, turns: true, last: true, update: true, thread: true, freshness: true, data: true }),
  activity: Object.freeze({ state: true, source: true, tools: true, lastTool: true, approval: true, retry: true, errors: true }),
  system: Object.freeze({ cpu: true, ram: true, ramCapacity: true })
});

const PRESET_DEFINITIONS = Object.freeze({
  recommended: Object.freeze({
    sections: Object.freeze({ context: true, usage: true, session: true, activity: true, system: true }),
    metrics: Object.freeze({
      activity: true, model: true, reasoning: true, project: true, context: true, usage: true,
      quota: true, session: true, health: true, freshness: true, system: true, tools: true,
      gitBranch: false, gitDiff: false, gitAheadBehind: false
    }),
    systemMode: 'on',
    beastMode: 'off',
    header: Object.freeze(['activity', 'model', 'reasoning', 'project'])
  }),
  compact: Object.freeze({
    sections: Object.freeze({ context: true, usage: true, session: true, activity: true, system: false }),
    metrics: Object.freeze({
      activity: true, model: true, reasoning: false, project: true, context: true, usage: true,
      quota: true, session: true, health: false, freshness: true, system: false, tools: true,
      gitBranch: false, gitDiff: false, gitAheadBehind: false
    }),
    systemMode: 'off',
    beastMode: 'off',
    header: Object.freeze(['activity', 'model', 'project'])
  }),
  full: Object.freeze({
    sections: Object.freeze({ context: true, usage: true, session: true, activity: true, system: true }),
    metrics: Object.freeze({
      activity: true, model: true, reasoning: true, project: true, context: true, usage: true,
      quota: true, session: true, health: true, freshness: true, system: true, tools: true,
      gitBranch: true, gitDiff: true, gitAheadBehind: true
    }),
    systemMode: 'on',
    beastMode: 'on',
    header: Object.freeze(['activity', 'model', 'reasoning', 'project', 'git'])
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

function fieldVisibility(input, fallback = DEFAULT_FIELD_VISIBILITY) {
  const result = {};
  for (const [section, fields] of Object.entries(DEFAULT_FIELD_VISIBILITY)) {
    let source = input?.[section];
    if (section === 'usage' && source && typeof source === 'object' && source.routed === undefined && typeof source.actual === 'boolean') {
      source = { ...source, routed: source.actual };
    }
    result[section] = booleanMap(source, Object.keys(fields), fallback?.[section] ?? fields);
  }
  return result;
}

function uniqueValid(values, valid, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  return [...new Set(source.filter((value) => valid.has(value)))];
}

function normalizeMode(input, key, valid, fallback, legacyValue = undefined, legacyTrue = 'on') {
  const direct = String(input?.[key] ?? '').trim().toLowerCase();
  if (valid.has(direct)) return direct;
  if (legacyValue === true) return legacyTrue;
  if (legacyValue === false) return 'off';
  return valid.has(fallback) ? fallback : 'off';
}

function normalizeBeastMode(input = {}, fallback = 'off') {
  return normalizeMode(input, 'beastMode', VALID.beastModes, fallback, input?.sections?.beast, 'auto');
}

function normalizeSystemMode(input = {}, fallback = 'off') {
  return normalizeMode(input, 'systemMode', VALID.systemModes, fallback, input?.sections?.system, 'on');
}

function normalizeManager(input = {}, fallback = { view: 'operations' }) {
  const requested = String(input?.manager?.view ?? '').trim().toLowerCase();
  return { view: VALID.managerViews.has(requested) ? requested : fallback?.view ?? 'operations' };
}

export function normalizeArchiveConfig(input = {}, fallback = DEFAULT_ARCHIVE_CONFIG) {
  const requestedLimit = input?.sizeLimitBytes;
  const sizeLimitBytes = requestedLimit === null || requestedLimit === undefined || requestedLimit === ''
    ? null
    : Number(requestedLimit);
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : Boolean(fallback?.enabled),
    retention: VALID.archiveRetentions.has(input?.retention) ? input.retention : fallback?.retention ?? 'forever',
    sizeLimitBytes: Number.isSafeInteger(sizeLimitBytes) && sizeLimitBytes > 0 ? sizeLimitBytes : null,
    autoCleanup: typeof input?.autoCleanup === 'boolean' ? input.autoCleanup : Boolean(fallback?.autoCleanup)
  };
}

export const DEFAULT_CONFIG = Object.freeze({
  configVersion: CONFIG_VERSION,
  setupComplete: false,
  language: 'vi',
  preset: 'recommended',
  theme: 'color',
  background: 'terminal',
  systemMode: 'on',
  beastMode: 'off',
  layout: 'auto',
  sections: PRESET_DEFINITIONS.recommended.sections,
  metrics: PRESET_DEFINITIONS.recommended.metrics,
  fields: DEFAULT_FIELD_VISIBILITY,
  header: PRESET_DEFINITIONS.recommended.header,
  manager: Object.freeze({ view: 'operations' }),
  archive: DEFAULT_ARCHIVE_CONFIG,
  updateCheck: true
});

export function configForPreset(preset = 'recommended', base = DEFAULT_CONFIG) {
  const normalizedPreset = VALID.presets.has(preset) ? preset : 'recommended';
  const presetDefinition = normalizedPreset === 'custom' ? null : PRESET_DEFINITIONS[normalizedPreset];
  const next = clone(base);
  next.preset = normalizedPreset;
  delete next.tabs;
  if (presetDefinition) {
    next.sections = clone(presetDefinition.sections);
    next.metrics = clone(presetDefinition.metrics);
    next.systemMode = presetDefinition.systemMode;
    next.beastMode = presetDefinition.beastMode;
    next.header = [...presetDefinition.header];
  }
  return next;
}

export function normalizeConfig(input = {}, { base = DEFAULT_CONFIG } = {}) {
  const requestedPreset = VALID.presets.has(input?.preset) ? input.preset : base.preset;
  const presetBase = configForPreset(requestedPreset, base);
  const config = {
    configVersion: CONFIG_VERSION,
    setupComplete: typeof input?.setupComplete === 'boolean' ? input.setupComplete : Boolean(presetBase.setupComplete),
    language: VALID.languages.has(input?.language) ? input.language : presetBase.language,
    preset: requestedPreset,
    theme: VALID.themes.has(input?.theme) ? input.theme : presetBase.theme,
    background: VALID.backgrounds.has(input?.background) ? input.background : presetBase.background,
    systemMode: normalizeSystemMode(input, presetBase.systemMode),
    beastMode: normalizeBeastMode(input, presetBase.beastMode),
    layout: 'auto',
    sections: booleanMap(input?.sections, [...VALID.sections], presetBase.sections),
    metrics: booleanMap(input?.metrics, [...VALID.metrics], presetBase.metrics),
    fields: fieldVisibility(input?.fields, presetBase.fields ?? DEFAULT_FIELD_VISIBILITY),
    header: uniqueValid(input?.header, VALID.header, presetBase.header),
    manager: normalizeManager(input, presetBase.manager ?? DEFAULT_CONFIG.manager),
    archive: normalizeArchiveConfig(input?.archive, presetBase.archive ?? DEFAULT_ARCHIVE_CONFIG),
    updateCheck: typeof input?.updateCheck === 'boolean' ? input.updateCheck : Boolean(presetBase.updateCheck)
  };
  config.sections.system = config.systemMode !== 'off' && config.metrics.system !== false;
  return config;
}

export function migrateConfig(input = {}, { existing = false } = {}) {
  const rawVersion = Number(input?.configVersion);
  const migrated = clone(input && typeof input === 'object' ? input : {});
  if (existing && (!Number.isSafeInteger(rawVersion) || rawVersion < CONFIG_VERSION) && typeof migrated.setupComplete !== 'boolean') {
    migrated.setupComplete = true;
  }
  if (!migrated.manager || typeof migrated.manager !== 'object') migrated.manager = { view: 'operations' };
  return normalizeConfig(migrated);
}

export function applyRuntimeOverrides(config, overrides = {}) {
  let next = normalizeConfig(config);
  if (overrides.preset && VALID.presets.has(overrides.preset)) next = normalizeConfig(configForPreset(overrides.preset, next));
  if (overrides.theme && VALID.themes.has(overrides.theme)) next.theme = overrides.theme;
  if (overrides.background && VALID.backgrounds.has(overrides.background)) next.background = overrides.background;
  if (overrides.language && VALID.languages.has(overrides.language)) next.language = overrides.language;
  if (overrides.managerView && VALID.managerViews.has(overrides.managerView)) next.manager.view = overrides.managerView;
  return next;
}

export function validateChoice(kind, value) {
  const set = VALID[kind];
  return Boolean(set?.has(value));
}

export { PRESET_DEFINITIONS, VALID as CONFIG_VALUES };
