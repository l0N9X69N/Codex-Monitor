const DEFAULT_METRIC_DEFINITIONS = Object.freeze({
  activity: { collectorId: 'session', cost: 'light' },
  model: { collectorId: 'session', cost: 'light' },
  reasoning: { collectorId: 'session', cost: 'light' },
  context: { collectorId: 'session', cost: 'light' },
  usage: { collectorId: 'session', cost: 'light' },
  quota: { collectorId: 'session', cost: 'light' },
  session: { collectorId: 'session', cost: 'light' },
  tools: { collectorId: 'session', cost: 'light' },
  resources: { collectorId: 'resources', cost: 'medium', activeViewOnly: true },
  disk: { collectorId: 'disk', cost: 'medium', activeViewOnly: true },
  system: { collectorId: 'system', cost: 'medium', activeViewOnly: true },
  performance: { collectorId: 'performance', cost: 'heavy', activeViewOnly: true, continuous: true },
  processes: { collectorId: 'processes', cost: 'heavy', activeViewOnly: true, continuous: true },
  gitBranch: { collectorId: 'git-branch', cost: 'light' },
  gitDiff: { collectorId: 'git-diff', cost: 'medium' },
  gitAheadBehind: { collectorId: 'git-ahead-behind', cost: 'medium' }
});

const DEFAULT_VIEW_METRICS = Object.freeze({
  overview: ['activity', 'model', 'reasoning', 'context', 'usage', 'quota', 'session'],
  tools: ['tools'],
  resources: ['resources', 'disk'],
  performance: ['performance'],
  processes: ['processes'],
  usage: ['usage', 'quota', 'context', 'model']
});

const DEFAULT_HEADER_METRICS = Object.freeze({
  activity: ['activity'],
  model: ['model'],
  reasoning: ['reasoning'],
  project: [],
  git: ['gitBranch'],
  auth: [],
  health: ['activity', 'context'],
  'session-age': ['session'],
  fast: []
});

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function metricEnabled(metric, enabledMetrics) {
  if (!enabledMetrics) return true;
  if (enabledMetrics instanceof Set) return enabledMetrics.has(metric);
  if (Array.isArray(enabledMetrics)) return enabledMetrics.includes(metric);
  if (typeof enabledMetrics === 'object') return enabledMetrics[metric] !== false;
  return true;
}

export function buildDemandGraph({
  header = [],
  enabledTabs = ['overview', 'tools', 'resources'],
  activeTab = 'overview',
  sections = {},
  enabledMetrics = null,
  viewMetrics = DEFAULT_VIEW_METRICS,
  headerMetrics = DEFAULT_HEADER_METRICS,
  metricDefinitions = DEFAULT_METRIC_DEFINITIONS,
  git = {}
} = {}) {
  const activeTabEnabled = enabledTabs.includes(activeTab);
  const requested = new Map();

  const request = (metric, consumer, { active = true, required = false } = {}) => {
    if (!required && !metricEnabled(metric, enabledMetrics)) return;
    const definition = metricDefinitions[metric];
    if (!definition) return;
    if (definition.activeViewOnly && !active) return;
    const entry = requested.get(metric) ?? {
      metric,
      collectorId: definition.collectorId,
      cost: definition.cost ?? 'light',
      continuous: Boolean(definition.continuous),
      consumers: []
    };
    entry.consumers.push(consumer);
    requested.set(metric, entry);
  };

  for (const item of header) {
    for (const metric of headerMetrics[item] ?? []) request(metric, `header:${item}`);
  }

  for (const tab of enabledTabs) {
    const active = tab === activeTab && activeTabEnabled;
    for (const metric of viewMetrics[tab] ?? []) request(metric, `tab:${tab}`, { active });
  }

  for (const [section, isEnabled] of Object.entries(sections)) {
    if (!isEnabled) continue;
    const metric = section === 'system' ? 'system' : section;
    request(metric, `section:${section}`, { active: activeTab === 'overview' });
  }

  if (header.includes('git')) {
    // Header > Git is an explicit display choice. Always collect the cheap
    // branch dependency even when the preset's optional gitBranch metric is
    // disabled; otherwise the renderer receives no branch and silently drops
    // the checked header item. Expensive diff/ahead-behind collectors remain
    // opt-in through their own metric flags.
    request('gitBranch', 'header:git', { required: true });
    if (git.diffStats) request('gitDiff', 'header:git');
    if (git.aheadBehind) request('gitAheadBehind', 'header:git');
  }

  const metrics = [...requested.values()].map((entry) => ({ ...entry, consumers: unique(entry.consumers) }));
  const collectors = new Map();
  for (const entry of metrics) {
    const current = collectors.get(entry.collectorId) ?? { collectorId: entry.collectorId, metrics: [], consumers: [], continuous: false, maxCost: 'light' };
    current.metrics.push(entry.metric);
    current.consumers.push(...entry.consumers);
    current.continuous ||= entry.continuous;
    if (entry.cost === 'heavy' || (entry.cost === 'medium' && current.maxCost === 'light')) current.maxCost = entry.cost;
    collectors.set(entry.collectorId, current);
  }

  return {
    activeTab: activeTabEnabled ? activeTab : null,
    metrics,
    collectors: [...collectors.values()].map((entry) => ({ ...entry, metrics: unique(entry.metrics), consumers: unique(entry.consumers) })),
    hasMetric(metric) { return requested.has(metric); },
    hasCollector(collectorId) { return collectors.has(collectorId); }
  };
}

export { DEFAULT_METRIC_DEFINITIONS, DEFAULT_VIEW_METRICS, DEFAULT_HEADER_METRICS };
