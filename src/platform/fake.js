import { assertPlatformAdapter, normalizeCapabilities } from './contract.js';

export function createFakePlatformAdapter(overrides = {}) {
  const calls = [];
  const record = (name, value) => { calls.push({ name, value }); return value; };
  const adapter = {
    id: overrides.id ?? 'fake',
    async spawnPty(options) { calls.push({ name: 'spawnPty', value: options }); return overrides.spawnPtyResult ?? null; },
    async getSystemUsage() { return record('getSystemUsage', overrides.systemUsage ?? { cpuPercent: 12, memoryBytes: 123456789 }); },
    async getProcessTree(pid) { calls.push({ name: 'getProcessTree', value: pid }); return overrides.processTree ?? []; },
    async getDiskInfo(cwd) { calls.push({ name: 'getDiskInfo', value: cwd }); return overrides.diskInfo ?? { path: cwd, totalBytes: null, freeBytes: null }; },
    async openHistoryTerminal(args = []) { calls.push({ name: 'openHistoryTerminal', value: args }); return overrides.historyTerminalResult ?? { ok: true }; },
    paths() { return record('paths', overrides.paths ?? {}); },
    capabilities() { return record('capabilities', normalizeCapabilities(overrides.capabilities ?? {})); },
    async cleanup() { calls.push({ name: 'cleanup', value: null }); return true; },
    calls
  };
  return assertPlatformAdapter(adapter);
}
