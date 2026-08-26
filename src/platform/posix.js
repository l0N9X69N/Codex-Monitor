import { execFile } from 'node:child_process';
import os from 'node:os';
import { spawnCodexPty } from './pty.js';
import { commonPaths, memorySnapshot, normalizeProcessRecord } from './common.js';
import { normalizeCapabilities, unsupportedResult } from './contract.js';

function execFileText(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      ...options
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout ?? ''));
    });
  });
}

function createAsyncCache(loader, ttlMs) {
  let cached = null;
  let cachedAt = 0;
  let inFlight = null;
  return async (...args) => {
    const now = Date.now();
    if (cached !== null && now - cachedAt < ttlMs) return cached;
    if (inFlight) return inFlight;
    inFlight = Promise.resolve(loader(...args))
      .then((value) => {
        cached = value;
        cachedAt = Date.now();
        return value;
      })
      .finally(() => { inFlight = null; });
    return inFlight;
  };
}

function elapsedToMs(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let days = 0;
  let clock = text;
  if (text.includes('-')) {
    const parts = text.split('-', 2);
    days = Number(parts[0]);
    clock = parts[1];
  }
  const parts = clock.split(':').map(Number);
  if (parts.some((item) => !Number.isFinite(item))) return null;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 3) [hours, minutes, seconds] = parts;
  else if (parts.length === 2) [minutes, seconds] = parts;
  else if (parts.length === 1) [seconds] = parts;
  else return null;
  return ((((days * 24) + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

function parsePs(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s*(.*)$/);
    if (!match) return null;
    const [, pid, ppid, name, cpu, rssKb, elapsed, command] = match;
    return normalizeProcessRecord({
      pid: Number(pid), ppid: Number(ppid), name, cpuPercent: Number(cpu), memoryBytes: Number(rssKb) * 1024,
      ageMs: elapsedToMs(elapsed), command: command || name
    });
  }).filter(Boolean);
}

function parseDf(text, fallbackPath) {
  const line = String(text ?? '').trim().split(/\r?\n/).at(-1) ?? '';
  const fields = line.trim().split(/\s+/);
  const totalKb = Number(fields[1]);
  const freeKb = Number(fields[3]);
  const mountPath = fields.length >= 6 ? fields.slice(5).join(' ') : fallbackPath;
  return {
    path: mountPath || fallbackPath,
    totalBytes: Number.isFinite(totalKb) ? totalKb * 1024 : null,
    freeBytes: Number.isFinite(freeKb) ? freeKb * 1024 : null
  };
}

export function createPosixMethods({ platform, env = process.env } = {}) {
  const getCachedProcessTree = createAsyncCache(async () => {
    const output = await execFileText('ps', ['-axo', 'pid=,ppid=,comm=,%cpu=,rss=,etime=,args='], {
      timeout: 2500,
      env
    });
    return parsePs(output);
  }, 1200);

  return {
    async spawnPty(options) { return spawnCodexPty({ ...options, platform }); },
    async getSystemUsage() {
      const memory = memorySnapshot();
      const cpus = Math.max(1, os.cpus()?.length ?? 1);
      const load = Number(os.loadavg()?.[0]);
      const cpuPercent = Number.isFinite(load) ? Math.max(0, Math.min(100, (load / cpus) * 100)) : null;
      return { cpuPercent, memoryBytes: memory.usedBytes, totalMemoryBytes: memory.totalBytes, freeMemoryBytes: memory.freeBytes };
    },
    async getProcessTree() {
      try { return await getCachedProcessTree(); }
      catch (error) { return unsupportedResult('processTree', error?.message ?? 'ps failed'); }
    },
    async getDiskInfo(cwd = process.cwd()) {
      try {
        const output = await execFileText('df', ['-kP', cwd], { timeout: 2000, env });
        return parseDf(output, cwd);
      } catch (error) { return unsupportedResult('diskInfo', error?.message ?? 'df failed'); }
    },
    paths() { return commonPaths({ env }); },
    capabilities() { return normalizeCapabilities({ pty: true, systemUsage: true, processTree: true, diskInfo: true, mouse: true, truecolor: null, caseInsensitivePaths: platform === 'darwin' }); },
    async cleanup() { return true; }
  };
}

export { elapsedToMs, parsePs, parseDf, execFileText };
