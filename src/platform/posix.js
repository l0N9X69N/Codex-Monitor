import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';
import { spawnCodexPty } from './pty.js';
import { commonPaths, memorySnapshot, normalizeProcessRecord } from './common.js';
import { normalizeCapabilities, unsupportedResult } from './contract.js';

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

function spawnChecked(file, args, { cwd, env }) {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(file, args, { cwd, env, detached: true, stdio: 'ignore' });
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (ok) child.unref();
      resolve(ok ? { ok: true, launcher: file } : null);
    };
    child.once('spawn', () => finish(true));
    child.once('error', () => finish(false));
  });
}

export function createPosixMethods({ platform, env = process.env, terminalLaunchers = [] } = {}) {
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
      try {
        const output = execFileSync('ps', ['-axo', 'pid=,ppid=,comm=,%cpu=,rss=,etime=,args='], { encoding: 'utf8', timeout: 2500, stdio: ['ignore', 'pipe', 'ignore'] });
        return parsePs(output);
      } catch (error) { return unsupportedResult('processTree', error?.message ?? 'ps failed'); }
    },
    async getDiskInfo(cwd = process.cwd()) {
      try {
        const output = execFileSync('df', ['-kP', cwd], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
        const line = output.trim().split(/\r?\n/).at(-1) ?? '';
        const fields = line.trim().split(/\s+/);
        const totalKb = Number(fields[1]);
        const freeKb = Number(fields[3]);
        return { path: cwd, totalBytes: Number.isFinite(totalKb) ? totalKb * 1024 : null, freeBytes: Number.isFinite(freeKb) ? freeKb * 1024 : null };
      } catch (error) { return unsupportedResult('diskInfo', error?.message ?? 'df failed'); }
    },
    async openHistoryTerminal({ command = 'codexm', args = ['--history'], cwd = process.cwd() } = {}) {
      for (const launcher of terminalLaunchers) {
        try {
          const spec = launcher({ command, args, cwd });
          const result = await spawnChecked(spec.file, spec.args, { cwd, env });
          if (result) return result;
        } catch {}
      }
      return { ok: false, error: 'could not open a supported terminal launcher' };
    },
    paths() { return commonPaths({ env }); },
    capabilities() { return normalizeCapabilities({ pty: true, systemUsage: true, processTree: true, diskInfo: true, historyTerminal: terminalLaunchers.length > 0, mouse: true, truecolor: null }); },
    async cleanup() { return true; }
  };
}

export { elapsedToMs, parsePs };
