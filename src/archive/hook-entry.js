import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadMonitorConfig } from '../config/store.js';
import { ensureArchiveService, signalArchiveHook } from './service-control.js';

export function runArchiveHook({
  loadConfig = loadMonitorConfig,
  signalHook = signalArchiveHook,
  ensureService = ensureArchiveService
} = {}) {
  try {
    const loaded = loadConfig();
    const config = loaded?.config ?? loaded;
    if (config?.archive?.enabled !== true) {
      return { ok: true, enabled: false, signaled: false, service: null };
    }

    let signaled = false;
    try {
      signalHook();
      signaled = true;
    } catch {}

    let service = null;
    try {
      service = ensureService({ config });
    } catch {}

    return { ok: true, enabled: true, signaled, service };
  } catch {
    return { ok: true, enabled: null, signaled: false, service: null };
  }
}

const SELF_PATH = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF_PATH);
if (isMain) {
  runArchiveHook();
  process.exitCode = 0;
}
