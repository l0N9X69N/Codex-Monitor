import { applyArchiveConfigSideEffects } from '../config/archive-effects.js';
import {
  CONFIG_VALUES,
  DEFAULT_FIELD_VISIBILITY,
  configForPreset,
  normalizeConfig
} from '../config/schema.js';
import { saveMonitorConfig } from '../config/store.js';
import { ArchiveConfigPanel } from './archive-config-panel.js';

export const MANAGER_CONFIG_TABS = Object.freeze([
  'live-view',
  'cards',
  'fields',
  'header',
  'companion',
  'appearance',
  'archive',
  'manager',
  'updates'
]);

export const MANAGER_CONFIG_TAB_LABELS = Object.freeze({
  'live-view': 'Live View',
  cards: 'Cards',
  fields: 'Fields',
  header: 'Header',
  companion: 'Companion',
  appearance: 'Appearance',
  archive: 'Archive',
  manager: 'Manager',
  updates: 'Updates'
});

const FIELD_LABELS = Object.freeze({
  used: 'Used % / tokens', gauge: 'Gauge', cache: 'Cache', left: 'Left %', compaction: 'Compactions',
  fiveHour: '5-hour quota', weekly: 'Weekly quota', input: 'Input tokens', output: 'Output tokens', reasoning: 'Reasoning tokens',
  turnInput: 'Turn input', turnOutput: 'Turn output', model: 'Model', routed: 'Routed model', elapsed: 'Elapsed', turns: 'Turns',
  last: 'Last turn', update: 'Update age', thread: 'Session ID', freshness: 'Freshness', data: 'Data source', state: 'State', source: 'Source',
  tools: 'Tools', lastTool: 'Last tool', approval: 'Approval', retry: 'Retries', errors: 'Errors', cpu: 'CPU', ram: 'RAM', ramCapacity: 'RAM capacity'
});

const CARD_META = Object.freeze({
  context: Object.freeze({ label: 'Context', description: 'Track context-window usage and pressure.' }),
  usage: Object.freeze({ label: 'Usage', description: 'Track token usage and available quota.' }),
  session: Object.freeze({ label: 'Session', description: 'Show current session identity and timing.' }),
  activity: Object.freeze({ label: 'Activity', description: 'Show current Codex activity and tool state.' }),
  system: Object.freeze({ label: 'System', description: 'Show CPU/RAM telemetry when available.' })
});

const HEADER_META = Object.freeze({
  activity: Object.freeze({ label: 'Activity', description: 'Current Codex activity state.' }),
  model: Object.freeze({ label: 'Model', description: 'Active model name.' }),
  reasoning: Object.freeze({ label: 'Reasoning', description: 'Current reasoning effort.' }),
  project: Object.freeze({ label: 'Project', description: 'Current project or working directory label.' }),
  git: Object.freeze({ label: 'Git', description: 'Current branch and revision when available.' }),
  auth: Object.freeze({ label: 'Auth', description: 'Detected login or API authentication mode.' }),
  health: Object.freeze({ label: 'Health', description: 'Monitor/runtime health summary.' }),
  'session-age': Object.freeze({ label: 'Session age', description: 'Elapsed age of the current session.' })
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cycle(values, current, delta = 1) {
  const list = Array.isArray(values) ? values : [...values];
  if (!list.length) return current;
  const index = list.indexOf(current);
  const base = index < 0 ? 0 : index;
  return list[(base + delta + list.length) % list.length];
}

function enabledLabel(value) {
  return value ? 'On' : 'Off';
}

function toggleRow({ id, label, checked, description = '', editable = true }) {
  return {
    id,
    label,
    value: enabledLabel(checked),
    editable,
    kind: 'toggle',
    checked: Boolean(checked),
    description
  };
}

function fieldRows(config) {
  const rows = [];
  for (const [section, fields] of Object.entries(DEFAULT_FIELD_VISIBILITY)) {
    for (const key of Object.keys(fields)) {
      rows.push(toggleRow({
        id: `field:${section}:${key}`,
        label: `${section.toUpperCase()} · ${FIELD_LABELS[key] ?? key}`,
        checked: config.fields?.[section]?.[key],
        description: `Show this metric in the ${section.toUpperCase()} card.`
      }));
    }
  }
  return rows;
}

function headerRows(config) {
  const selected = new Set(config.header ?? []);
  return [...CONFIG_VALUES.header].map((key) => {
    const meta = HEADER_META[key] ?? { label: key, description: 'Show this item in the Live HUD header.' };
    return toggleRow({
      id: `header:${key}`,
      label: meta.label,
      checked: selected.has(key),
      description: meta.description
    });
  });
}

function rowsForTab(tab, config, archivePanel = null) {
  if (tab === 'live-view') {
    return [
      { id: 'preset', label: 'Preset', value: config.preset, editable: true, description: 'Choose the base Live HUD layout.' },
      { id: 'systemMode', label: 'System mode', value: config.systemMode, editable: true, description: 'Control when system telemetry is collected and shown.' },
      { id: 'beastMode', label: 'Companion / Beast mode', value: config.beastMode, editable: true, description: 'Control companion visibility in the Live HUD.' }
    ];
  }
  if (tab === 'cards') {
    return ['context', 'usage', 'session', 'activity', 'system'].map((key) => {
      const meta = CARD_META[key] ?? { label: key, description: '' };
      const checked = key === 'system' ? config.systemMode !== 'off' : config.sections?.[key];
      return toggleRow({ id: `card:${key}`, label: meta.label, checked, description: meta.description });
    });
  }
  if (tab === 'fields') return fieldRows(config);
  if (tab === 'header') return headerRows(config);
  if (tab === 'companion') return [{ id: 'companion-status', label: 'Companion controls', value: 'Uses Live View Beast mode in current schema', editable: false }];
  if (tab === 'appearance') {
    return [
      { id: 'theme', label: 'Theme', value: config.theme, editable: true, description: 'Choose the terminal color treatment.' },
      { id: 'background', label: 'Background', value: config.background, editable: true, description: 'Choose the expected terminal background.' },
      { id: 'language', label: 'Language', value: config.language, editable: true, description: 'Choose the Monitor UI language.' }
    ];
  }
  if (tab === 'archive') return archivePanel?.rows?.(config) ?? [];
  if (tab === 'manager') return [{ id: 'manager-status', label: 'Manager preferences', value: 'No persisted Manager-only fields in v1 schema yet', editable: false }];
  if (tab === 'updates') {
    return [toggleRow({
      id: 'updateCheck',
      label: 'Update checks',
      checked: config.updateCheck,
      description: 'Allow Monitor to check whether a newer release is available.'
    })];
  }
  return [];
}

function archiveStatus(effects) {
  if (!effects?.changed) return 'Saved';
  if (effects.transition === 'off-to-on') {
    return effects.ok
      ? 'Saved · Archive enabled · review /hooks in Codex once'
      : `Saved · Archive enabled · activation warning: ${effects.error ?? 'unknown error'}`;
  }
  if (effects.transition === 'on-to-off') {
    return effects.ok
      ? 'Saved · Archive disabled · SQLite archive kept'
      : `Saved · Archive disabled · stop warning: ${effects.error ?? 'unknown error'}`;
  }
  return 'Saved';
}

export class ManagerConfigController {
  constructor({
    config,
    filePath,
    save = saveMonitorConfig,
    applyArchiveEffects = applyArchiveConfigSideEffects,
    archivePanel = new ArchiveConfigPanel()
  } = {}) {
    this.filePath = filePath;
    this.saveConfig = save;
    this.applyArchiveEffects = applyArchiveEffects;
    this.archivePanel = archivePanel;
    this.savedConfig = normalizeConfig(config);
    this.draftConfig = clone(this.savedConfig);
    this.tabIndex = 0;
    this.cursorIndex = 0;
    this.status = '';
  }

  get activeTab() {
    return MANAGER_CONFIG_TABS[this.tabIndex] ?? MANAGER_CONFIG_TABS[0];
  }

  get activeTabLabel() {
    return MANAGER_CONFIG_TAB_LABELS[this.activeTab] ?? this.activeTab;
  }

  get dirty() {
    return JSON.stringify(this.savedConfig) !== JSON.stringify(this.draftConfig);
  }

  rows() {
    return rowsForTab(this.activeTab, this.draftConfig, this.archivePanel);
  }

  currentRow() {
    return this.rows()[this.cursorIndex] ?? null;
  }

  moveTab(delta = 1) {
    const count = MANAGER_CONFIG_TABS.length;
    this.tabIndex = (this.tabIndex + delta + count) % count;
    this.cursorIndex = 0;
    this.status = '';
    this.archivePanel?.cancelConfirmation?.();
    if (this.activeTab === 'archive') this.archivePanel?.refresh?.();
    return this.activeTab;
  }

  moveCursor(delta = 1) {
    const rows = this.rows();
    if (!rows.length) {
      this.cursorIndex = 0;
      return 0;
    }
    const previous = this.cursorIndex;
    this.cursorIndex = Math.max(0, Math.min(rows.length - 1, this.cursorIndex + delta));
    if (this.cursorIndex !== previous) this.archivePanel?.cancelConfirmation?.();
    return this.cursorIndex;
  }

  cursorHome() {
    this.cursorIndex = 0;
    this.archivePanel?.cancelConfirmation?.();
  }

  cursorEnd() {
    this.cursorIndex = Math.max(0, this.rows().length - 1);
    this.archivePanel?.cancelConfirmation?.();
  }

  _customize() {
    if (this.draftConfig.preset !== 'custom') this.draftConfig.preset = 'custom';
  }

  editCurrent(delta = 1) {
    const row = this.currentRow();
    if (!row?.editable) {
      this.status = row ? 'This setting is informational in the current v1 schema' : '';
      return false;
    }

    const id = row.id;
    if (id.startsWith('archive:action:')) {
      const action = this.archivePanel?.run?.(id, this.savedConfig) ?? { ok: false, status: 'Archive action unavailable' };
      this.status = action.status ?? (action.ok ? 'Archive action complete' : 'Archive action failed');
      return Boolean(action.ok || action.pending);
    }

    if (id === 'preset') {
      const next = cycle(CONFIG_VALUES.presets, this.draftConfig.preset, delta);
      this.draftConfig = normalizeConfig(configForPreset(next, this.draftConfig));
    } else if (id === 'systemMode') {
      this._customize();
      this.draftConfig.systemMode = cycle(CONFIG_VALUES.systemModes, this.draftConfig.systemMode, delta);
      this.draftConfig = normalizeConfig(this.draftConfig);
    } else if (id === 'beastMode') {
      this._customize();
      this.draftConfig.beastMode = cycle(CONFIG_VALUES.beastModes, this.draftConfig.beastMode, delta);
      this.draftConfig = normalizeConfig(this.draftConfig);
    } else if (id.startsWith('card:')) {
      this._customize();
      const key = id.slice('card:'.length);
      if (key === 'system') {
        const enabling = this.draftConfig.systemMode === 'off';
        this.draftConfig.systemMode = enabling ? 'auto' : 'off';
        if (enabling) this.draftConfig.metrics.system = true;
      } else {
        this.draftConfig.sections[key] = !this.draftConfig.sections[key];
      }
      this.draftConfig = normalizeConfig(this.draftConfig);
    } else if (id.startsWith('field:')) {
      this._customize();
      const [, section, key] = id.split(':');
      this.draftConfig.fields[section][key] = !this.draftConfig.fields[section][key];
      this.draftConfig = normalizeConfig(this.draftConfig);
    } else if (id.startsWith('header:')) {
      this._customize();
      const key = id.slice('header:'.length);
      const selected = new Set(this.draftConfig.header);
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      this.draftConfig.header = [...CONFIG_VALUES.header].filter((item) => selected.has(item));
      this.draftConfig = normalizeConfig(this.draftConfig);
    } else if (id === 'theme') {
      this.draftConfig.theme = cycle(CONFIG_VALUES.themes, this.draftConfig.theme, delta);
    } else if (id === 'background') {
      this.draftConfig.background = cycle(CONFIG_VALUES.backgrounds, this.draftConfig.background, delta);
    } else if (id === 'language') {
      this.draftConfig.language = cycle(CONFIG_VALUES.languages, this.draftConfig.language, delta);
    } else if (id === 'archive:enabled') {
      this.archivePanel?.cancelConfirmation?.();
      this.draftConfig.archive.enabled = !this.draftConfig.archive.enabled;
    } else if (id === 'updateCheck') {
      this.draftConfig.updateCheck = !this.draftConfig.updateCheck;
    }

    this.draftConfig = normalizeConfig(this.draftConfig);
    this.status = this.dirty ? 'Unsaved changes' : '';
    return true;
  }

  revert() {
    this.draftConfig = clone(this.savedConfig);
    this.archivePanel?.cancelConfirmation?.();
    this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.rows().length - 1));
    this.status = 'Reverted unsaved changes';
    return this.draftConfig;
  }

  save() {
    const before = clone(this.savedConfig);
    try {
      const result = this.saveConfig(this.draftConfig, { filePath: this.filePath });
      const next = normalizeConfig(result?.config ?? this.draftConfig);
      const effects = this.applyArchiveEffects(before, next);
      this.savedConfig = clone(next);
      this.draftConfig = clone(next);
      this.archivePanel?.cancelConfirmation?.();
      if (this.activeTab === 'archive') this.archivePanel?.refresh?.();
      this.status = archiveStatus(effects);
      return { saved: true, config: next, filePath: result?.filePath ?? this.filePath, archiveEffects: effects, error: null };
    } catch (error) {
      this.status = `Save failed: ${error?.message ?? String(error)}`;
      return { saved: false, config: clone(this.draftConfig), filePath: this.filePath, archiveEffects: null, error };
    }
  }
}
