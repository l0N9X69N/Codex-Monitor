export const MANAGER_TIMELINE_FILTERS = Object.freeze([
  'all',
  'tools',
  'files',
  'shell',
  'agents',
  'errors',
  'turns'
]);

const SEARCH_TEXT_CACHE = new WeakMap();
const FILTER_RESULT_CACHE = new WeakMap();

function lower(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isAgentSpawnTool(name) {
  const clean = lower(name);
  if (!clean) return false;
  const leaf = clean.split(/[.:/\\]/).filter(Boolean).at(-1) ?? clean;
  return leaf === 'spawn_agent';
}

export function timelineCategoryForTool(name, rawType = '') {
  const tool = lower(name);
  const type = lower(rawType);
  if (isAgentSpawnTool(tool)) return 'agent';
  if (type.includes('patch_apply') || tool.includes('apply_patch') || tool.includes('write_file') || tool.includes('read_file') || tool.includes('edit_file')) return 'file';
  if (type.includes('exec_command') || type.includes('local_shell') || tool === 'shell' || tool.includes('exec_command') || tool.includes('shell')) return 'shell';
  if (type.includes('web_search') || tool.includes('web_search')) return 'tool';
  return 'tool';
}

function eventMatchesFilter(event, filter) {
  const normalized = MANAGER_TIMELINE_FILTERS.includes(lower(filter)) ? lower(filter) : 'all';
  if (normalized === 'all') return true;
  const category = lower(event?.category);
  const group = lower(event?.group);
  if (normalized === 'tools') return ['tool', 'shell', 'file', 'agent', 'result'].includes(category) || ['tool', 'shell', 'file', 'agent'].includes(group);
  if (normalized === 'files') return category === 'file' || group === 'file';
  if (normalized === 'shell') return category === 'shell' || group === 'shell';
  if (normalized === 'agents') return category === 'agent' || group === 'agent';
  if (normalized === 'errors') return category === 'error' || category === 'retry' || event?.failed === true;
  if (normalized === 'turns') return category === 'turn';
  return true;
}

function searchableText(event) {
  if (event && typeof event === 'object') {
    const cached = SEARCH_TEXT_CACHE.get(event);
    if (cached != null) return cached;
  }
  const value = [
    event?.category,
    event?.group,
    event?.label,
    event?.rawType,
    event?.role,
    event?.turnId,
    event?.callId,
    event?.tool,
    event?.detail,
    event?.command,
    event?.cwd,
    event?.path,
    event?.query,
    event?.input,
    event?.output,
    event?.status,
    event?.exitCode
  ].map(lower).join('\n');
  if (event && typeof event === 'object') SEARCH_TEXT_CACHE.set(event, value);
  return value;
}

export function filterSessionTimeline(events = [], { filter = 'all', search = '' } = {}) {
  const source = Array.isArray(events) ? events : [];
  const normalizedFilter = MANAGER_TIMELINE_FILTERS.includes(lower(filter)) ? lower(filter) : 'all';
  const query = lower(search);
  const cached = FILTER_RESULT_CACHE.get(source);
  if (cached
    && cached.length === source.length
    && cached.filter === normalizedFilter
    && cached.search === query) {
    return cached.result;
  }

  const result = [];
  for (const event of source) {
    if (!event || !eventMatchesFilter(event, normalizedFilter)) continue;
    if (query && !searchableText(event).includes(query)) continue;
    result.push(event);
  }
  FILTER_RESULT_CACHE.set(source, {
    length: source.length,
    filter: normalizedFilter,
    search: query,
    result
  });
  return result;
}

export function nextTimelineFilter(filter = 'all') {
  const normalized = lower(filter);
  const index = MANAGER_TIMELINE_FILTERS.indexOf(normalized);
  return MANAGER_TIMELINE_FILTERS[(index < 0 ? 0 : index + 1) % MANAGER_TIMELINE_FILTERS.length];
}
