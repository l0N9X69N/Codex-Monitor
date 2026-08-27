import fs from 'node:fs';
import path from 'node:path';
import { monitorDataDir } from '../platform/common.js';
import { checkForUpdates } from './update.js';

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_STATE_FILENAME = 'update-check.json';

function statePath(options = {}) {
  return path.join(monitorDataDir(options), UPDATE_STATE_FILENAME);
}

function readState(filePath, fsRef = fs) {
  try {
    const parsed = JSON.parse(fsRef.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(filePath, state, fsRef = fs) {
  fsRef.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fsRef.writeFileSync(filePath, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function shouldCheckForUpdates(config, {
  now = () => Date.now(),
  fsRef = fs,
  filePath = statePath()
} = {}) {
  if (config?.updateCheck === false) return false;
  const last = Number(readState(filePath, fsRef)?.lastCheckedAt ?? 0);
  return !Number.isFinite(last) || last <= 0 || now() - last >= UPDATE_CHECK_INTERVAL_MS;
}

export function scheduleBackgroundUpdateCheck(config, {
  now = () => Date.now(),
  fsRef = fs,
  filePath = statePath(),
  check = checkForUpdates,
  schedule = (fn) => {
    const timer = setTimeout(fn, 0);
    timer.unref?.();
    return timer;
  },
  onUpdate = null
} = {}) {
  if (!shouldCheckForUpdates(config, { now, fsRef, filePath })) return { scheduled: false, reason: 'throttled-or-disabled' };

  schedule(async () => {
    const checkedAt = now();
    const report = await check();
    try {
      writeState(filePath, {
        lastCheckedAt: checkedAt,
        latestVersion: report?.latestVersion ?? null,
        updateAvailable: report?.updateAvailable === true
      }, fsRef);
    } catch {}
    if (report?.updateAvailable === true) {
      try { onUpdate?.(report); } catch {}
    }
  });

  return { scheduled: true, reason: 'scheduled' };
}
