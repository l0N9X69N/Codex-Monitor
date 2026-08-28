import { ManagerConfigController } from '../manager/config-controller.js';
import { CONFIG_VALUES, DEFAULT_CONFIG, DEFAULT_FIELD_VISIBILITY, configForPreset, normalizeConfig } from './schema.js';

const FIRST_RUN_ACTIONS = new Set(['run', 'manager']);

const STEP = Object.freeze({
  WELCOME: 'welcome',
  LANGUAGE: 'language',
  PRESET: 'preset',
  CUSTOM_SECTIONS: 'custom-sections',
  CUSTOM_DISPLAY: 'custom-display',
  CUSTOM_HEADER: 'custom-header',
  CUSTOM_FIELDS: 'custom-fields',
  APPEARANCE: 'appearance',
  MANAGER: 'manager',
  SUMMARY: 'summary'
});

const LANGUAGE_CHOICES = Object.freeze([
  { value: 'vi', label: 'Vietnamese' },
  { value: 'en', label: 'English' }
]);

const PRESET_CHOICES = Object.freeze([
  { value: 'recommended', label: 'Recommended' },
  { value: 'compact', label: 'Compact' },
  { value: 'full', label: 'Full' },
  { value: 'custom', label: 'Custom' }
]);

const THEME_CHOICES = Object.freeze([
  { value: 'color', label: 'Color' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'matrix', label: 'Matrix' },
  { value: 'mono', label: 'Mono' }
]);

const BACKGROUND_CHOICES = Object.freeze([
  { value: 'terminal', label: 'Terminal' },
  { value: 'black', label: 'Black' },
  { value: 'dark', label: 'Dark' }
]);

const MANAGER_CHOICES = Object.freeze([
  { value: 'operations', label: 'Operations' },
  { value: 'table', label: 'Table' },
  { value: 'charts', label: 'Charts' },
  { value: 'auto', label: 'Auto' }
]);

const SECTION_LABELS = Object.freeze({
  context: 'Context', usage: 'Usage', session: 'Session', activity: 'Activity', system: 'System'
});

const HEADER_LABELS = Object.freeze({
  activity: 'Activity', model: 'Model', reasoning: 'Reasoning', project: 'Project', git: 'Git', auth: 'Auth', health: 'Health', 'session-age': 'Session age'
});

const FIELD_LABELS = Object.freeze({
  used: 'Used % / tokens', gauge: 'Gauge', cache: 'Cache', left: 'Left %', compaction: 'Compactions',
  fiveHour: '5-hour quota', weekly: 'Weekly quota', input: 'Input tokens', output: 'Output tokens', reasoning: 'Reasoning tokens',
  turnInput: 'Turn input', turnOutput: 'Turn output', model: 'Model', routed: 'Routed model', elapsed: 'Elapsed', turns: 'Turns',
  last: 'Last turn', update: 'Update age', thread: 'Session ID', freshness: 'Freshness', data: 'Data source', state: 'State', source: 'Source',
  tools: 'Tools', lastTool: 'Last tool', approval: 'Approval', retry: 'Retries', errors: 'Errors', cpu: 'CPU', ram: 'RAM', ramCapacity: 'RAM capacity'
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function selectable(value, choices) {
  const index = choices.findIndex((choice) => choice.value === value);
  return index < 0 ? 0 : index;
}

function cycleChoice(choices, value, delta) {
  if (!choices.length) return value;
  const index = selectable(value, choices);
  return choices[(index + delta + choices.length) % choices.length].value;
}

function modeLabel(value) {
  if (value === 'on') return 'On';
  if (value === 'auto') return 'Auto';
  return 'Off';
}

export function shouldRunFirstRunOnboarding({ action = 'run', interactive = false, loaded = null } = {}) {
  if (!interactive || !FIRST_RUN_ACTIONS.has(action)) return false;
  if (loaded?.valid === true && loaded?.config?.setupComplete === true) return false;
  return true;
}

export class OnboardingController {
  constructor({
    currentConfig = DEFAULT_CONFIG,
    previousConfig = currentConfig,
    filePath,
    save,
    applyArchiveEffects
  } = {}) {
    this.configController = new ManagerConfigController({
      config: normalizeConfig(previousConfig),
      filePath,
      ...(save ? { save } : {}),
      ...(applyArchiveEffects ? { applyArchiveEffects } : {})
    });
    this.configController.draftConfig = normalizeConfig(currentConfig);
    this.configController.draftConfig.setupComplete = false;
    this.step = STEP.WELCOME;
    this.cursorIndex = 0;
    this.saved = false;
    this.cancelled = false;
    this.status = '';
  }

  get draftConfig() {
    return this.configController.draftConfig;
  }

  rows() {
    const config = this.draftConfig;
    if (this.step === STEP.WELCOME) return [];
    if (this.step === STEP.LANGUAGE) return LANGUAGE_CHOICES.map((choice) => ({ id: `language:${choice.value}`, label: choice.label, value: choice.value, selected: config.language === choice.value, kind: 'choice' }));
    if (this.step === STEP.PRESET) return PRESET_CHOICES.map((choice) => ({ id: `preset:${choice.value}`, label: choice.label, value: choice.value, selected: config.preset === choice.value, kind: 'choice' }));
    if (this.step === STEP.CUSTOM_SECTIONS) {
      return [
        ...Object.keys(SECTION_LABELS).map((key) => ({ id: `section:${key}`, label: SECTION_LABELS[key], checked: Boolean(config.sections?.[key]), kind: 'toggle' })),
        { id: 'continue', label: 'Continue', kind: 'action' }
      ];
    }
    if (this.step === STEP.CUSTOM_DISPLAY) {
      return [
        { id: 'systemMode', label: 'System', value: modeLabel(config.systemMode), kind: 'cycle' },
        { id: 'beastMode', label: 'Companion', value: config.beastMode === 'on' ? 'Always' : modeLabel(config.beastMode), kind: 'cycle' },
        { id: 'continue', label: 'Continue', kind: 'action' }
      ];
    }
    if (this.step === STEP.CUSTOM_HEADER) {
      const selected = new Set(config.header ?? []);
      return [
        ...[...CONFIG_VALUES.header].map((key) => ({ id: `header:${key}`, label: HEADER_LABELS[key] ?? key, checked: selected.has(key), kind: 'toggle' })),
        { id: 'continue', label: 'Continue', kind: 'action' }
      ];
    }
    if (this.step === STEP.CUSTOM_FIELDS) {
      const rows = [];
      for (const [section, fields] of Object.entries(DEFAULT_FIELD_VISIBILITY)) {
        for (const key of Object.keys(fields)) {
          rows.push({
            id: `field:${section}:${key}`,
            label: `${SECTION_LABELS[section] ?? section} · ${FIELD_LABELS[key] ?? key}`,
            checked: Boolean(config.fields?.[section]?.[key]),
            kind: 'toggle'
          });
        }
      }
      rows.push({ id: 'continue', label: 'Continue', kind: 'action' });
      return rows;
    }
    if (this.step === STEP.APPEARANCE) {
      return [
        { id: 'theme', label: 'Theme', value: THEME_CHOICES.find((item) => item.value === config.theme)?.label ?? config.theme, kind: 'cycle' },
        { id: 'background', label: 'Background', value: BACKGROUND_CHOICES.find((item) => item.value === config.background)?.label ?? config.background, kind: 'cycle' },
        { id: 'continue', label: 'Continue', kind: 'action' }
      ];
    }
    if (this.step === STEP.MANAGER) return MANAGER_CHOICES.map((choice) => ({ id: `manager:${choice.value}`, label: choice.label, value: choice.value, selected: config.manager?.view === choice.value, kind: 'choice' }));
    if (this.step === STEP.SUMMARY) return [];
    return [];
  }

  currentRow() {
    return this.rows()[this.cursorIndex] ?? null;
  }

  moveCursor(delta = 1) {
    const rows = this.rows();
    if (!rows.length) {
      this.cursorIndex = 0;
      return 0;
    }
    this.cursorIndex = Math.max(0, Math.min(rows.length - 1, this.cursorIndex + delta));
    return this.cursorIndex;
  }

  _setDraft(next) {
    const setupComplete = Boolean(this.draftConfig.setupComplete);
    this.configController.draftConfig = normalizeConfig(next);
    this.configController.draftConfig.setupComplete = setupComplete;
  }

  _go(step) {
    this.step = step;
    this.cursorIndex = 0;
    this.status = '';
  }

  back() {
    if (this.step === STEP.WELCOME) return false;
    if (this.step === STEP.LANGUAGE) this._go(STEP.WELCOME);
    else if (this.step === STEP.PRESET) this._go(STEP.LANGUAGE);
    else if (this.step === STEP.CUSTOM_SECTIONS) this._go(STEP.PRESET);
    else if (this.step === STEP.CUSTOM_DISPLAY) this._go(STEP.CUSTOM_SECTIONS);
    else if (this.step === STEP.CUSTOM_HEADER) this._go(STEP.CUSTOM_DISPLAY);
    else if (this.step === STEP.CUSTOM_FIELDS) this._go(STEP.CUSTOM_HEADER);
    else if (this.step === STEP.APPEARANCE) this._go(this.draftConfig.preset === 'custom' ? STEP.CUSTOM_FIELDS : STEP.PRESET);
    else if (this.step === STEP.MANAGER) this._go(STEP.APPEARANCE);
    else if (this.step === STEP.SUMMARY) this._go(STEP.MANAGER);
    return true;
  }

  cancel() {
    this.cancelled = true;
    return { saved: false, cancelled: true, config: clone(this.configController.savedConfig) };
  }

  activateCurrent(delta = 1) {
    if (this.step === STEP.WELCOME) {
      this._go(STEP.LANGUAGE);
      return { advanced: true };
    }
    if (this.step === STEP.SUMMARY) return this.save();

    const row = this.currentRow();
    if (!row) return { advanced: false };
    const id = row.id;

    if (id.startsWith('language:')) {
      this.draftConfig.language = id.slice('language:'.length);
      this._setDraft(this.draftConfig);
      this._go(STEP.PRESET);
      return { advanced: true };
    }
    if (id.startsWith('preset:')) {
      const preset = id.slice('preset:'.length);
      this._setDraft(configForPreset(preset, this.draftConfig));
      this._go(preset === 'custom' ? STEP.CUSTOM_SECTIONS : STEP.APPEARANCE);
      return { advanced: true };
    }
    if (id.startsWith('section:')) {
      const key = id.slice('section:'.length);
      if (key === 'system') {
        const enabling = this.draftConfig.systemMode === 'off';
        this.draftConfig.systemMode = enabling ? 'on' : 'off';
        this.draftConfig.metrics.system = enabling;
      } else {
        this.draftConfig.sections[key] = !this.draftConfig.sections[key];
      }
      this._setDraft(this.draftConfig);
      return { advanced: false, edited: true };
    }
    if (id === 'systemMode') {
      this.draftConfig.systemMode = cycleChoice([...CONFIG_VALUES.systemModes].map((value) => ({ value })), this.draftConfig.systemMode, delta);
      if (this.draftConfig.systemMode !== 'off') this.draftConfig.metrics.system = true;
      this._setDraft(this.draftConfig);
      return { edited: true };
    }
    if (id === 'beastMode') {
      this.draftConfig.beastMode = cycleChoice([...CONFIG_VALUES.beastModes].map((value) => ({ value })), this.draftConfig.beastMode, delta);
      this._setDraft(this.draftConfig);
      return { edited: true };
    }
    if (id.startsWith('header:')) {
      const key = id.slice('header:'.length);
      const selected = new Set(this.draftConfig.header ?? []);
      if (selected.has(key)) selected.delete(key); else selected.add(key);
      this.draftConfig.header = [...CONFIG_VALUES.header].filter((item) => selected.has(item));
      this._setDraft(this.draftConfig);
      return { edited: true };
    }
    if (id.startsWith('field:')) {
      const [, section, key] = id.split(':');
      this.draftConfig.fields[section][key] = !this.draftConfig.fields[section][key];
      this._setDraft(this.draftConfig);
      return { edited: true };
    }
    if (id === 'theme') {
      this.draftConfig.theme = cycleChoice(THEME_CHOICES, this.draftConfig.theme, delta);
      this._setDraft(this.draftConfig);
      return { edited: true };
    }
    if (id === 'background') {
      this.draftConfig.background = cycleChoice(BACKGROUND_CHOICES, this.draftConfig.background, delta);
      this._setDraft(this.draftConfig);
      return { edited: true };
    }
    if (id.startsWith('manager:')) {
      this.draftConfig.manager.view = id.slice('manager:'.length);
      this._setDraft(this.draftConfig);
      this._go(STEP.SUMMARY);
      return { advanced: true };
    }
    if (id === 'continue') {
      if (this.step === STEP.CUSTOM_SECTIONS) this._go(STEP.CUSTOM_DISPLAY);
      else if (this.step === STEP.CUSTOM_DISPLAY) this._go(STEP.CUSTOM_HEADER);
      else if (this.step === STEP.CUSTOM_HEADER) this._go(STEP.CUSTOM_FIELDS);
      else if (this.step === STEP.CUSTOM_FIELDS) this._go(STEP.APPEARANCE);
      else if (this.step === STEP.APPEARANCE) this._go(STEP.MANAGER);
      return { advanced: true };
    }
    return { advanced: false };
  }

  save() {
    this.draftConfig.setupComplete = true;
    const result = this.configController.save();
    if (result.saved) {
      this.saved = true;
      this.cancelled = false;
      this.status = 'Saved';
      return { ...result, cancelled: false };
    }
    this.draftConfig.setupComplete = false;
    this.status = this.configController.status;
    return { ...result, cancelled: false };
  }
}

export { STEP as ONBOARDING_STEP };
