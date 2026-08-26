import { execFile } from 'node:child_process';
import path from 'node:path';
import { spawnCodexPty } from './pty.js';
import { assertPlatformAdapter, normalizeCapabilities, unsupportedResult } from './contract.js';
import { commonPaths, memorySnapshot, normalizeProcessRecord } from './common.js';

function execFileText(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      ...options
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout ?? ''));
    });
  });
}

function createAsyncCache(loader, ttlMs) {
  let value = null;
  let valueAt = 0;
  let inFlight = null;

  return async (...args) => {
    const now = Date.now();
    if (value !== null && now - valueAt < ttlMs) return value;
    if (inFlight) return inFlight;

    inFlight = Promise.resolve()
      .then(() => loader(...args))
      .then((next) => {
        value = next;
        valueAt = Date.now();
        return next;
      })
      .finally(() => { inFlight = null; });

    return inFlight;
  };
}

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

async function windowsProcessTree() {
  // Process/session correlation needs identity + start time, not per-process CPU.
  // Win32_PerfFormattedData_PerfProc_Process can be very slow or unavailable on
  // some Windows hosts, so keep the critical process-tree query independent of it.
  const script = [
    '$now=Get-Date;',
    'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize,CreationDate | ForEach-Object {',
    '$age=$null; if($_.CreationDate){try{$age=[Math]::Max(0,($now-$_.CreationDate).TotalMilliseconds)}catch{}};',
    '[pscustomobject]@{ProcessId=$_.ProcessId;ParentProcessId=$_.ParentProcessId;Name=$_.Name;CommandLine=$_.CommandLine;WorkingSetSize=$_.WorkingSetSize;AgeMs=$age;CpuPercent=$null}',
    '} | ConvertTo-Csv -NoTypeInformation'
  ].join(' ');

  const text = await execFileText('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    timeout: 6000,
    windowsHide: true
  });
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    const entry = Object.fromEntries(header.map((key, index) => [key, row[index]]));
    return normalizeProcessRecord({
      pid: Number(entry.ProcessId), ppid: Number(entry.ParentProcessId), name: entry.Name,
      command: entry.CommandLine || entry.Name,
      cpuPercent: null,
      memoryBytes: Number(entry.WorkingSetSize), ageMs: entry.AgeMs === '' ? null : Number(entry.AgeMs)
    });
  });
}

async function windowsSystemUsage() {
  const memory = memorySnapshot();
  let cpuPercent = null;
  try {
    const raw = (await execFileText('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'
    ], { timeout: 2000 })).trim();
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) cpuPercent = parsed;
  } catch {}
  return {
    cpuPercent,
    memoryBytes: memory.usedBytes,
    totalMemoryBytes: memory.totalBytes,
    freeMemoryBytes: memory.freeBytes
  };
}

export function createWindowsPlatformAdapter({ env = process.env } = {}) {
  // CIM/PowerShell queries are expensive on Windows. Keep them asynchronous and
  // deduplicate closely spaced requests so collectors never block stdin/PTY I/O.
  const getCachedProcessTree = createAsyncCache(windowsProcessTree, 1200);
  const getCachedSystemUsage = createAsyncCache(windowsSystemUsage, 1500);

  const adapter = {
    id: 'win32',
    async spawnPty(options) { return spawnCodexPty({ ...options, platform: 'win32' }); },
    async getSystemUsage() {
      return getCachedSystemUsage();
    },
    async getProcessTree() {
      try { return await getCachedProcessTree(); }
      catch (error) { return unsupportedResult('processTree', error?.message ?? 'PowerShell process query failed'); }
    },
    async getDiskInfo(cwd = process.cwd()) {
      try {
        const root = path.parse(path.resolve(cwd)).root.replace(/\\$/, '');
        const script = `$d=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='${root.replace(/'/g, "''")}'\"; if($d){$d.Size.ToString()+'|'+$d.FreeSpace.ToString()}`;
        const raw = (await execFileText('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
          timeout: 2000
        })).trim();
        const [total, free] = raw.split('|').map(Number);
        return { path: root, totalBytes: Number.isFinite(total) ? total : null, freeBytes: Number.isFinite(free) ? free : null };
      } catch (error) { return unsupportedResult('diskInfo', error?.message ?? 'disk query failed'); }
    },
    paths() { return commonPaths({ env }); },
    capabilities() { return normalizeCapabilities({ pty: true, systemUsage: true, processTree: true, diskInfo: true, mouse: true, truecolor: null }); },
    async cleanup() { return true; }
  };
  return assertPlatformAdapter(adapter);
}

export { parseCsvLine, windowsProcessTree, execFileText };
