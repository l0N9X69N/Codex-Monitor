import fs from 'node:fs/promises';
import path from 'node:path';
import { sourceIdentityFromStat } from './source-reader.js';

function finiteLimit(value) {
  if (value === Number.POSITIVE_INFINITY) return value;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : Number.POSITIVE_INFINITY;
}

function scanError(error, target, operation) {
  return {
    path: target,
    operation,
    code: error?.code ?? null,
    error: error?.message ?? String(error ?? 'archive source scan failed')
  };
}

export async function scanArchiveSourcesWithHealth(rootPath, {
  fsRef = fs,
  maxFiles = Number.POSITIVE_INFINITY
} = {}) {
  if (!rootPath) return { sources: [], complete: true, errors: [], limited: false };
  const root = path.resolve(rootPath);
  const limit = finiteLimit(maxFiles);
  if (limit === 0) return { sources: [], complete: false, errors: [], limited: true };

  const found = [];
  const errors = [];
  const stack = [root];
  let limited = false;

  while (stack.length) {
    if (found.length >= limit) {
      limited = true;
      break;
    }

    const current = stack.pop();
    let entries;
    try {
      entries = await fsRef.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (current === root && error?.code === 'ENOENT') {
        return { sources: [], complete: true, errors: [], limited: false };
      }
      errors.push(scanError(error, current, 'readdir'));
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
      } catch (error) {
        errors.push(scanError(error, fullPath, 'stat'));
      }

      if (found.length >= limit) {
        limited = true;
        break;
      }
    }
  }

  found.sort((left, right) => {
    const byMtime = Number(right.mtimeMs ?? 0) - Number(left.mtimeMs ?? 0);
    return byMtime || left.filePath.localeCompare(right.filePath);
  });

  return {
    sources: found,
    complete: errors.length === 0 && !limited,
    errors,
    limited
  };
}

export async function scanArchiveSources(rootPath, options = {}) {
  return (await scanArchiveSourcesWithHealth(rootPath, options)).sources;
}
