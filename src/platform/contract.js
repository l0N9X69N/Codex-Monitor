export const PLATFORM_METHODS = Object.freeze([
  'spawnPty',
  'getSystemUsage',
  'getProcessTree',
  'getDiskInfo',
  'openHistoryTerminal',
  'paths',
  'capabilities',
  'cleanup'
]);

export function assertPlatformAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new Error('platform adapter must be an object');
  for (const method of PLATFORM_METHODS) {
    if (typeof adapter[method] !== 'function') throw new Error(`platform adapter missing ${method}()`);
  }
  if (!adapter.id || typeof adapter.id !== 'string') throw new Error('platform adapter requires id');
  return adapter;
}

export function normalizeCapabilities(value = {}) {
  return {
    pty: value.pty !== false,
    systemUsage: value.systemUsage !== false,
    processTree: value.processTree !== false,
    diskInfo: value.diskInfo !== false,
    historyTerminal: value.historyTerminal !== false,
    mouse: value.mouse !== false,
    truecolor: value.truecolor ?? null
  };
}

export function unsupportedResult(feature, detail = null) {
  return { supported: false, feature, detail, value: null };
}
