import fs from 'node:fs/promises';
import path from 'node:path';
import { sourceIdentityFromStat } from './source-reader.js';

function finiteLimit(value) {
  if (value === Number.POSITIVE_INFINITY) return value;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : Number.POSITIVE_INFINITY;
}

export async function scanArchiveSources(rootPath, {
  fsRef = fs,
  maxFiles = Number.POSITIVE_INFINITY
} = {}) {
  if (!rootPath) return [];
  const root = path.resolve(rootPath);
  const limit = finiteLimit(maxFiles);
  if (limit === 0) return [];

  const found = [];
  const stack = [root];

  while (stack.length && found.length < limit) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fsRef.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (current === root && error?.code === 'ENOENT') return [];
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.jsonl')) continue;

      try {
        const stat = await fsRef.stat(fullPath);
        if (!stat.isFile?.()) continue;
        found.push({
          filePath: fullPath,
          fileIdentity: sourceIdentityFromStat(stat),
          size: Number(stat.size),
          mtimeMs: Number(stat.mtimeMs)
        });
      } catch {}

      if (found.length >= limit) break;
    }
  }

  found.sort((left, right) => {
    const byMtime = Number(right.mtimeMs ?? 0) - Number(left.mtimeMs ?? 0);
    return byMtime || left.filePath.localeCompare(right.filePath);
  });
  return found;
}
