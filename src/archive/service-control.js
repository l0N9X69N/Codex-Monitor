import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { monitorDataDir } from '../platform/common.js';

export const ARCHIVE_SERVICE_LOCK_FILENAME = 'archive-service.lock';
export const ARCHIVE_SERVICE_WAKE_FILENAME = 'archive-service.wake';
export const ARCHIVE_SERVICE_ENTRY_PATH = fileURLToPath(new URL('./service-entry.js', import.meta.url));

function resolvedDataDir({ dataDir = null, ...pathOptions } = {}) {
  return dataDir ? path.resolve(dataDir) : monitorDataDir(pathOptions);
}

export function getArchiveServicePaths(options = {}) {
  const dataDir = resolvedDataDir(options);
  return {
    dataDir,
    lockPath: path.join(dataDir, ARCHIVE_SERVICE_LOCK_FILENAME),
    wakePath: path.join(dataDir, ARCHIVE_SERVICE_WAKE_FILENAME)
  };
}

function parseLock(raw) {
  try {
    const value = JSON.parse(String(raw));
    const pid = Number(value?.pid);
    if (!value?.instanceId || !Number.isSafeInteger(pid) || pid <= 0) return null;
    return {
      instanceId: String(value.instanceId),
      pid,
      startedAt: Number.isFinite(Number(value.startedAt)) ? Math.trunc(Number(value.startedAt)) : null
    };
  } catch {
    return null;
  }
}

export function readArchiveServiceLock({
  lockPath = null,
  fsRef = fs,
  ...pathOptions
} = {}) {
  const resolvedPath = lockPath ? path.resolve(lockPath) : getArchiveServicePaths(pathOptions).lockPath;
  try {
    return parseLock(fsRef.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function isArchiveServicePidAlive(pid, { processRef = process } = {}) {
  const numericPid = Number(pid);
  if (!Number.isSafeInteger(numericPid) || numericPid <= 0) return false;
  try {
    processRef.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

export function getArchiveServiceStatus({
  lockPath = null,
  fsRef = fs,
  processRef = process,
  ...pathOptions
} = {}) {
  const paths = getArchiveServicePaths(pathOptions);
  const resolvedLockPath = lockPath ? path.resolve(lockPath) : paths.lockPath;
  const owner = readArchiveServiceLock({ lockPath: resolvedLockPath, fsRef });
  if (!owner) return { running: false, owner: null, lockPath: resolvedLockPath };
  return {
    running: isArchiveServicePidAlive(owner.pid, { processRef }),
    owner,
    lockPath: resolvedLockPath
  };
}

export function acquireArchiveServiceLock({
  instanceId,
  pid = process.pid,
  startedAt = Date.now(),
  lockPath = null,
  fsRef = fs,
  processRef = process,
  ...pathOptions
} = {}) {
  if (!instanceId) throw new Error('archive service instanceId is required');
  const paths = getArchiveServicePaths(pathOptions);
  const resolvedLockPath = lockPath ? path.resolve(lockPath) : paths.lockPath;
  fsRef.mkdirSync(path.dirname(resolvedLockPath), { recursive: true, mode: 0o700 });

  const payload = `${JSON.stringify({ instanceId: String(instanceId), pid: Number(pid), startedAt: Number(startedAt) })}\n`;
  const tryCreate = () => {
    let fd = null;
    try {
      fd = fsRef.openSync(resolvedLockPath, 'wx', 0o600);
      fsRef.writeFileSync(fd, payload, 'utf8');
      return { acquired: true, lockPath: resolvedLockPath, owner: parseLock(payload) };
    } finally {
      if (fd != null) {
        try { fsRef.closeSync(fd); } catch {}
      }
    }
  };

  try {
    return tryCreate();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  const existing = readArchiveServiceLock({ lockPath: resolvedLockPath, fsRef });
  if (existing && isArchiveServicePidAlive(existing.pid, { processRef })) {
    return { acquired: false, reason: 'already-running', lockPath: resolvedLockPath, owner: existing };
  }

  try { fsRef.unlinkSync(resolvedLockPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  try {
    return tryCreate();
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return {
        acquired: false,
        reason: 'lock-race',
        lockPath: resolvedLockPath,
        owner: readArchiveServiceLock({ lockPath: resolvedLockPath, fsRef })
      };
    }
    throw error;
  }
}

export function releaseArchiveServiceLock({
  instanceId,
  lockPath = null,
  fsRef = fs,
  ...pathOptions
} = {}) {
  if (!instanceId) return false;
  const paths = getArchiveServicePaths(pathOptions);
  const resolvedLockPath = lockPath ? path.resolve(lockPath) : paths.lockPath;
  const owner = readArchiveServiceLock({ lockPath: resolvedLockPath, fsRef });
  if (!owner || owner.instanceId !== String(instanceId)) return false;
  try {
    fsRef.unlinkSync(resolvedLockPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function wakeArchiveService({
  wakePath = null,
  fsRef = fs,
  now = () => Date.now(),
  ...pathOptions
} = {}) {
  const paths = getArchiveServicePaths(pathOptions);
  const resolvedWakePath = wakePath ? path.resolve(wakePath) : paths.wakePath;
  fsRef.mkdirSync(path.dirname(resolvedWakePath), { recursive: true, mode: 0o700 });
  fsRef.writeFileSync(resolvedWakePath, `${Math.trunc(Number(now()))}\n`, { encoding: 'utf8', mode: 0o600 });
  return resolvedWakePath;
}

export function ensureArchiveService({
  config,
  dataDir = null,
  fsRef = fs,
  processRef = process,
  spawnProcess = spawn,
  execPath = process.execPath,
  entryPath = ARCHIVE_SERVICE_ENTRY_PATH,
  env = process.env
} = {}) {
  if (config?.archive?.enabled !== true) {
    return { started: false, running: false, reason: 'archive-disabled' };
  }

  const paths = getArchiveServicePaths({ dataDir, env });
  const status = getArchiveServiceStatus({
    dataDir: paths.dataDir,
    lockPath: paths.lockPath,
    fsRef,
    processRef
  });

  if (status.running) {
    try {
      wakeArchiveService({ dataDir: paths.dataDir, wakePath: paths.wakePath, fsRef });
      return { started: false, running: true, reason: 'already-running', owner: status.owner, wakeError: null };
    } catch (error) {
      return { started: false, running: true, reason: 'already-running', owner: status.owner, wakeError: error?.message ?? String(error) };
    }
  }

  const childEnv = { ...env };
  if (dataDir) childEnv.CODEXM_DATA_HOME = path.resolve(dataDir);

  try {
    const child = spawnProcess(execPath, [entryPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: childEnv
    });
    child?.once?.('error', () => {});
    child?.unref?.();
    return { started: true, running: true, reason: 'spawned', pid: Number(child?.pid) || null };
  } catch (error) {
    return { started: false, running: false, reason: 'spawn-failed', error: error?.message ?? String(error) };
  }
}
