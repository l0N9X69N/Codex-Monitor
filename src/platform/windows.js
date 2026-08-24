import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { spawnCodexPty } from './pty.js';
import { assertPlatformAdapter, normalizeCapabilities, unsupportedResult } from './contract.js';
import { commonPaths, memorySnapshot, normalizeProcessRecord } from './common.js';

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      values.push(current);
      current = '';
    } else current += ch;
  }
  values.push(current);
  return values;
}

function windowsProcessTree() {
  const script = [
    '$p=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize,CreationDate;',
    '$p | ConvertTo-Csv -NoTypeInformation'
  ].join(' ');
  const text = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 3500, stdio: ['ignore', 'pipe', 'ignore']
  });
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    const entry = Object.fromEntries(header.map((key, index) => [key, row[index]]));
    const created = Date.parse(entry.CreationDate);
    return normalizeProcessRecord({
      pid: Number(entry.ProcessId),
      ppid: Number(entry.ParentProcessId),
      name: entry.Name,
      command: entry.CommandLine || entry.Name,
      memoryBytes: Number(entry.WorkingSetSize),
      ageMs: Number.isFinite(created) ? Math.max(0, Date.now() - created) : null
    });
  });
}

export function createWindowsPlatformAdapter({ env = process.env } = {}) {
  const adapter = {
    id: 'win32',
    async spawnPty(options) { return spawnCodexPty({ ...options, platform: 'win32' }); },
    async getSystemUsage() {
      const memory = memorySnapshot();
      let cpuPercent = null;
      try {
        const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'], {
          encoding: 'utf8', windowsHide: true, timeout: 2000, stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) cpuPercent = parsed;
      } catch {}
      return { cpuPercent, memoryBytes: memory.usedBytes, totalMemoryBytes: memory.totalBytes, freeMemoryBytes: memory.freeBytes };
    },
    async getProcessTree() {
      try { return windowsProcessTree(); }
      catch (error) { return unsupportedResult('processTree', error?.message ?? 'PowerShell process query failed'); }
    },
    async getDiskInfo(cwd = process.cwd()) {
      try {
        const root = path.parse(path.resolve(cwd)).root.replace(/\\$/, '');
        const script = `$d=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='${root.replace(/'/g, "''")}'\"; if($d){$d.Size.ToString()+'|'+$d.FreeSpace.ToString()}`;
        const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
          encoding: 'utf8', windowsHide: true, timeout: 2000, stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        const [total, free] = raw.split('|').map(Number);
        return { path: root, totalBytes: Number.isFinite(total) ? total : null, freeBytes: Number.isFinite(free) ? free : null };
      } catch (error) { return unsupportedResult('diskInfo', error?.message ?? 'disk query failed'); }
    },
    async openHistoryTerminal({ command = 'codexm', args = ['--history'], cwd = process.cwd() } = {}) {
      const launch = (file, launchArgs) => {
        const child = spawn(file, launchArgs, { cwd, env, detached: true, windowsHide: true, stdio: 'ignore' });
        child.unref();
        return { ok: true, launcher: file };
      };
      try { return launch('wt.exe', ['new-tab', '--startingDirectory', cwd, command, ...args]); }
      catch {}
      try { return launch(env.ComSpec || 'cmd.exe', ['/d', '/c', 'start', '', command, ...args]); }
      catch (error) { return { ok: false, error: error?.message ?? 'could not open terminal' }; }
    },
    paths() { return commonPaths({ env }); },
    capabilities() { return normalizeCapabilities({ pty: true, systemUsage: true, processTree: true, diskInfo: true, historyTerminal: true, mouse: true, truecolor: null }); },
    async cleanup() { return true; }
  };
  return assertPlatformAdapter(adapter);
}
