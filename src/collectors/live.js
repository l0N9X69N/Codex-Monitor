import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { CollectorRegistry } from './registry.js';
import { RingBuffer } from '../core/ring-buffer.js';
import { setMetric } from '../core/normalized-state.js';
import { PROVENANCE } from '../core/provenance.js';
import { sanitizeText } from '../core/sanitize.js';

function relativeSafe(cwd, filePath) {
  try {
    const rel = path.relative(cwd, filePath);
    return rel && !rel.startsWith('..') ? rel : path.basename(filePath);
  } catch { return path.basename(filePath); }
}

export function scanResourceMetadata(cwd, { fsRef = fs } = {}) {
  const found = { instructions: [], skills: [], mcp: [], rules: [], permissions: [] };
  const files = [
    ['instructions', 'AGENTS.md'], ['instructions', 'CLAUDE.md'], ['instructions', 'INSTRUCTIONS.md'],
    ['mcp', '.mcp.json'], ['mcp', 'mcp.json'], ['rules', '.cursorrules'], ['rules', 'RULES.md'],
    ['permissions', '.codex/permissions.json'], ['permissions', 'permissions.json']
  ];
  for (const [kind, rel] of files) {
    const full = path.join(cwd, rel);
    try { if (fsRef.statSync(full).isFile()) found[kind].push(rel); } catch {}
  }
  for (const rel of ['.codex/skills', '.agents/skills', 'skills']) {
    const full = path.join(cwd, rel);
    let entries = [];
    try { entries = fsRef.readdirSync(full, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isDirectory()) found.skills.push(`${rel}/${sanitizeText(entry.name, { maxLength: 80 })}`);
    }
  }
  for (const key of Object.keys(found)) found[key] = [...new Set(found[key])].slice(0, 100);
  return found;
}

function descendants(tree, rootPid) {
  if (!Array.isArray(tree) || !Number.isFinite(rootPid)) return [];
  const byParent = new Map();
  for (const item of tree) {
    const list = byParent.get(item.ppid) ?? [];
    list.push(item);
    byParent.set(item.ppid, list);
  }
  const result = [];
  const queue = [rootPid];
  const seen = new Set();
  while (queue.length) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const own = tree.find((item) => item.pid === pid);
    if (own) result.push(own);
    for (const child of byParent.get(pid) ?? []) queue.push(child.pid);
  }
  return result;
}

function sanitizedProcesses(tree) {
  return tree.map((item) => ({
    pid: item.pid,
    ppid: item.ppid,
    name: sanitizeText(item.name, { maxLength: 80 }) || '--',
    command: sanitizeText(item.command, { maxLength: 180 }) || '--',
    cpuPercent: Number.isFinite(item.cpuPercent) ? item.cpuPercent : null,
    memoryBytes: Number.isFinite(item.memoryBytes) ? item.memoryBytes : null,
    ageMs: Number.isFinite(item.ageMs) ? item.ageMs : null
  }));
}

function execFileText(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      ...options
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout ?? ''));
    });
  });
}

async function git(cwd, args) {
  return (await execFileText('git', args, {
    cwd,
    timeout: 1800,
    windowsHide: true
  })).trim();
}

export function createLiveCollectorRegistry({ state, adapter, cwd = process.cwd(), sessionTailer = null, now = () => Date.now(), processRef = process } = {}) {
  const registry = new CollectorRegistry();
  const performanceSamples = new RingBuffer(60);
  let previousMonitorCpu = processRef.cpuUsage?.() ?? null;
  let previousMonitorAt = now();

  registry.register({ id: 'session', ttlMs: 250, minIntervalMs: 250, priority: 100, async run() { return sessionTailer?.poll?.() ?? { bound: false }; } });

  registry.register({
    id: 'resources', ttlMs: 15_000, minIntervalMs: 15_000, priority: 45,
    async run() {
      const result = scanResourceMetadata(cwd);
      const atMs = now();
      for (const key of ['instructions', 'skills', 'mcp', 'rules', 'permissions']) setMetric(state.resources, key, result[key], { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'metadata-only-resource-scan' });
      setMetric(state.resources, 'scannedAtMs', atMs, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'metadata-only-resource-scan' });
      return result;
    }
  });

  registry.register({
    id: 'disk', ttlMs: 30_000, minIntervalMs: 30_000, priority: 25,
    async run() {
      const result = await adapter.getDiskInfo(cwd);
      if (result?.supported !== false) setMetric(state.system, 'disk', result, { source: PROVENANCE.LOCAL, observedAtMs: now(), evidence: `platform:${adapter.id}` });
      return result;
    }
  });

  registry.register({
    id: 'system', ttlMs: 2000, minIntervalMs: 2000, priority: 55,
    async run() {
      const result = await adapter.getSystemUsage();
      const atMs = now();
      if (result && result.supported !== false) {
        for (const [key, metricValue] of Object.entries({ cpuPercent: result.cpuPercent, memoryBytes: result.memoryBytes, totalMemoryBytes: result.totalMemoryBytes, freeMemoryBytes: result.freeMemoryBytes })) {
          if (metricValue != null) setMetric(state.system, key, metricValue, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: `platform:${adapter.id}` });
        }
      }
      return result;
    }
  });

  registry.register({
    id: 'processes', ttlMs: 1200, minIntervalMs: 1200, priority: 40,
    async run() {
      const rootPid = state.processes.rootPid.value;
      const raw = await adapter.getProcessTree(rootPid);
      if (!Array.isArray(raw)) return raw;
      const scoped = sanitizedProcesses(descendants(raw, rootPid));
      const hot = [...scoped].filter((item) => Number.isFinite(item.cpuPercent)).sort((a, b) => b.cpuPercent - a.cpuPercent)[0] ?? null;
      const atMs = now();
      setMetric(state.processes, 'list', scoped, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: `platform:${adapter.id}` });
      setMetric(state.processes, 'hot', hot, { source: PROVENANCE.DERIVED, observedAtMs: atMs, evidence: 'max cpu in Codex process tree' });
      return scoped;
    }
  });

  registry.register({
    id: 'performance', ttlMs: 1000, minIntervalMs: 1000, priority: 35,
    async run() {
      const atMs = now();
      const rootPid = state.processes.rootPid.value;
      // Both platform calls are asynchronous. Running them together keeps the UI
      // responsive and avoids serial PowerShell latency on Windows.
      const [system, rawTree] = await Promise.all([
        adapter.getSystemUsage(),
        adapter.getProcessTree(rootPid)
      ]);
      const scoped = Array.isArray(rawTree) ? descendants(rawTree, rootPid) : [];
      const codexRoot = scoped.find((item) => item.pid === rootPid) ?? null;
      const currentCpu = processRef.cpuUsage?.() ?? null;
      const elapsedUs = Math.max(1, (atMs - previousMonitorAt) * 1000);
      let monitorCpuPercent = null;
      if (currentCpu && previousMonitorCpu) {
        const usedUs = (currentCpu.user - previousMonitorCpu.user) + (currentCpu.system - previousMonitorCpu.system);
        monitorCpuPercent = Math.max(0, (usedUs / elapsedUs) * 100);
      }
      previousMonitorCpu = currentCpu;
      previousMonitorAt = atMs;
      const monitorMemoryBytes = processRef.memoryUsage?.().rss ?? null;
      const sample = {
        atMs,
        codexCpuPercent: codexRoot?.cpuPercent ?? null,
        codexMemoryBytes: codexRoot?.memoryBytes ?? null,
        monitorCpuPercent,
        monitorMemoryBytes,
        systemCpuPercent: system?.supported === false ? null : system?.cpuPercent ?? null,
        systemMemoryBytes: system?.supported === false ? null : system?.memoryBytes ?? null
      };
      performanceSamples.push(sample);
      for (const [key, metricValue] of Object.entries(sample)) if (key !== 'atMs' && metricValue != null) setMetric(state.performance, key, metricValue, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: `platform:${adapter.id}` });
      setMetric(state.performance, 'samples', performanceSamples.toArray(), { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'ram-ring-buffer' });
      return sample;
    }
  });

  registry.register({ id: 'git-branch', ttlMs: 4000, minIntervalMs: 4000, priority: 60, async run() { let branch = null; try { branch = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']); } catch {} setMetric(state.git, 'branch', branch, { source: PROVENANCE.LOCAL, observedAtMs: now(), evidence: 'git local branch' }); return branch; } });
  registry.register({ id: 'git-diff', ttlMs: 5000, minIntervalMs: 5000, priority: 30, async run() { let diff = null; try { const lines = (await git(cwd, ['status', '--porcelain'])).split(/\r?\n/).filter(Boolean); diff = { changedFiles: lines.length }; } catch {} setMetric(state.git, 'diff', diff, { source: PROVENANCE.LOCAL, observedAtMs: now(), evidence: 'git status --porcelain' }); return diff; } });
  registry.register({ id: 'git-ahead-behind', ttlMs: 10_000, minIntervalMs: 10_000, priority: 25, async run() { let result = null; try { const raw = await git(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']); const [ahead, behind] = raw.split(/\s+/).map(Number); result = { ahead: Number.isFinite(ahead) ? ahead : null, behind: Number.isFinite(behind) ? behind : null }; } catch {} setMetric(state.git, 'aheadBehind', result, { source: PROVENANCE.LOCAL, observedAtMs: now(), evidence: 'git local upstream compare; no fetch' }); return result; } });

  return registry;
}

export { descendants as processDescendants, relativeSafe };
