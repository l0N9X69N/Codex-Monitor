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

function parseNumstat(raw) {
  let additions = 0;
  let deletions = 0;
  for (const line of String(raw ?? '').split(/\r?\n/).filter(Boolean)) {
    const [added, deleted] = line.split('\t');
    const add = Number(added);
    const del = Number(deleted);
    if (Number.isFinite(add)) additions += add;
    if (Number.isFinite(del)) deletions += del;
  }
  return { additions, deletions };
}

function parsePorcelain(raw) {
  const counts = { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0, conflicted: 0 };
  const lines = String(raw ?? '').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const code = line.slice(0, 2);
    if (code === '??') { counts.untracked += 1; continue; }
    if (code.includes('U') || code === 'AA' || code === 'DD') counts.conflicted += 1;
    if (code.includes('A')) counts.added += 1;
    if (code.includes('M') || code.includes('T')) counts.modified += 1;
    if (code.includes('D')) counts.deleted += 1;
    if (code.includes('R') || code.includes('C')) counts.renamed += 1;
  }
  return { changedFiles: lines.length, ...counts };
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
      const [system, rawTree] = await Promise.all([adapter.getSystemUsage(), adapter.getProcessTree(rootPid)]);
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

  registry.register({
    id: 'git-branch', ttlMs: 4000, minIntervalMs: 4000, priority: 60,
    async run() {
      try {
        const branch = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
        setMetric(state.git, 'branch', branch, { source: PROVENANCE.LOCAL, observedAtMs: now(), evidence: 'git local branch' });
        return branch;
      } catch {
        return state.git.branch.value;
      }
    }
  });

  registry.register({
    id: 'git-diff', ttlMs: 3000, minIntervalMs: 3000, priority: 30,
    async run() {
      try {
        const [statusRaw, numstatRaw] = await Promise.all([
          git(cwd, ['status', '--porcelain']),
          git(cwd, ['diff', '--numstat', 'HEAD'])
        ]);
        const status = parsePorcelain(statusRaw);
        const stats = parseNumstat(numstatRaw);
        const diff = { ...status, additions: stats.additions, deletions: stats.deletions };
        const atMs = now();
        setMetric(state.git, 'dirty', status.changedFiles > 0, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'git status --porcelain' });
        setMetric(state.git, 'diff', diff, { source: PROVENANCE.LOCAL, observedAtMs: atMs, evidence: 'git status --porcelain + git diff --numstat HEAD' });
        return diff;
      } catch {
        return state.git.diff.value;
      }
    }
  });

  registry.register({
    id: 'git-ahead-behind', ttlMs: 10_000, minIntervalMs: 10_000, priority: 25,
    async run() {
      try {
        const raw = await git(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
        const [ahead, behind] = raw.split(/\s+/).map(Number);
        const result = { ahead: Number.isFinite(ahead) ? ahead : null, behind: Number.isFinite(behind) ? behind : null };
        setMetric(state.git, 'aheadBehind', result, { source: PROVENANCE.LOCAL, observedAtMs: now(), evidence: 'git local upstream compare; no fetch' });
        return result;
      } catch {
        return state.git.aheadBehind.value;
      }
    }
  });

  return registry;
}

export { descendants as processDescendants, relativeSafe, parsePorcelain as parseGitPorcelain };
