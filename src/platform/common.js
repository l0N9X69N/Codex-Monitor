import os from 'node:os';
import path from 'node:path';

export function codexHome({ env = process.env, homedir = os.homedir() } = {}) {
  return path.resolve(env.CODEX_HOME || path.join(homedir, '.codex'));
}

export function commonPaths({ env = process.env, homedir = os.homedir() } = {}) {
  const home = codexHome({ env, homedir });
  return {
    home,
    sessions: path.join(home, 'sessions'),
    auth: path.join(home, 'auth.json'),
    config: path.join(home, 'config.toml')
  };
}

export function monitorConfigDir({ env = process.env, platform = process.platform, homedir = os.homedir() } = {}) {
  if (env.CODEXM_CONFIG_HOME) return path.resolve(env.CODEXM_CONFIG_HOME);
  if (platform === 'win32') {
    const appData = env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
    return path.join(appData, 'codex-monitor');
  }
  const xdg = env.XDG_CONFIG_HOME || path.join(homedir, '.config');
  return path.join(xdg, 'codex-monitor');
}

export function memorySnapshot() {
  return {
    totalBytes: os.totalmem(),
    freeBytes: os.freemem(),
    usedBytes: Math.max(0, os.totalmem() - os.freemem()),
    loadAverage: os.loadavg()
  };
}

export function normalizeProcessRecord(record = {}) {
  return {
    pid: Number.isFinite(Number(record.pid)) ? Number(record.pid) : null,
    ppid: Number.isFinite(Number(record.ppid)) ? Number(record.ppid) : null,
    name: record.name ? String(record.name) : '--',
    command: record.command ? String(record.command) : '--',
    cpuPercent: record.cpuPercent !== null && record.cpuPercent !== undefined && Number.isFinite(Number(record.cpuPercent)) ? Number(record.cpuPercent) : null,
    memoryBytes: record.memoryBytes !== null && record.memoryBytes !== undefined && Number.isFinite(Number(record.memoryBytes)) ? Number(record.memoryBytes) : null,
    ageMs: record.ageMs !== null && record.ageMs !== undefined && Number.isFinite(Number(record.ageMs)) ? Number(record.ageMs) : null
  };
}
