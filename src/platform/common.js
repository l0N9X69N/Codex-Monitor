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
    cpuPercent: Number.isFinite(Number(record.cpuPercent)) ? Number(record.cpuPercent) : null,
    memoryBytes: Number.isFinite(Number(record.memoryBytes)) ? Number(record.memoryBytes) : null,
    ageMs: Number.isFinite(Number(record.ageMs)) ? Number(record.ageMs) : null
  };
}
