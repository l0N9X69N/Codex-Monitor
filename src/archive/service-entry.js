import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadMonitorConfig } from '../config/store.js';
import { commonPaths } from '../platform/common.js';
import { ArchiveReconcileCoordinator } from './coordinator.js';
import { openArchiveDatabase } from './database.js';
import { ArchiveHealthStore } from './health-store.js';
import {
  acquireArchiveServiceLock,
  consumeArchiveHookSignal,
  consumeArchiveServiceStopRequest,
  getArchiveServicePaths,
  releaseArchiveServiceLock
} from './service-control.js';
import { ArchiveServiceRuntime } from './service-runtime.js';

export function createArchiveSignalWatchers({
  wakePath,
  hookPath,
  stopPath,
  sessionsPath,
  onWake,
  onHook,
  onStop,
  onWatcherSeen = () => {},
  fsRef = fs
} = {}) {
  const watchers = [];
  const wakeName = wakePath ? path.basename(wakePath) : null;
  const hookName = hookPath ? path.basename(hookPath) : null;
  const stopName = stopPath ? path.basename(stopPath) : null;

  const addWatcher = (target, listener) => {
    if (!target) return;
    try {
      const watcher = fsRef.watch(target, { persistent: true }, listener);
      watcher.on?.('error', () => {});
      watchers.push(watcher);
    } catch {}
  };

  if (wakePath || hookPath || stopPath) {
    addWatcher(path.dirname(wakePath ?? hookPath ?? stopPath), (_eventType, filename) => {
      if (!filename) return;
      const name = String(filename);
      try { onWatcherSeen(); } catch {}
      if (wakeName && name === wakeName) {
        try { onWake?.('wake-file'); } catch {}
      }
      if (hookName && name === hookName) {
        try { onHook?.(); } catch {}
      }
      if (stopName && name === stopName) {
        try { onStop?.(); } catch {}
      }
    });
  }

  if (sessionsPath) {
    addWatcher(sessionsPath, () => {
      try { onWatcherSeen(); } catch {}
      try { onWake?.('sessions-watch'); } catch {}
    });
  }

  if (watchers.length > 0) {
    try { onWatcherSeen(); } catch {}
  }

  return {
    count: watchers.length,
    close() {
      for (const watcher of watchers.splice(0)) {
        try { watcher.close(); } catch {}
      }
    }
  };
}

export async function runArchiveServiceProcess({
  env = process.env,
  processRef = process,
  fsRef = fs,
  loadConfig = loadMonitorConfig,
  resolveCommonPaths = commonPaths,
  getServicePaths = getArchiveServicePaths,
  acquireLock = acquireArchiveServiceLock,
  releaseLock = releaseArchiveServiceLock,
  consumeStopRequest = consumeArchiveServiceStopRequest,
  consumeHookSignal = consumeArchiveHookSignal,
  openDatabase = openArchiveDatabase,
  Coordinator = ArchiveReconcileCoordinator,
  HealthStore = ArchiveHealthStore,
  Runtime = ArchiveServiceRuntime,
  watchSignals = createArchiveSignalWatchers,
  randomId = randomUUID
} = {}) {
  const loaded = loadConfig();
  const config = loaded?.config ?? loaded;
  if (config?.archive?.enabled !== true) return { code: 0, reason: 'archive-disabled' };

  const sessionPaths = resolveCommonPaths({ env });
  const servicePaths = getServicePaths({ env });
  const instanceId = String(randomId());
  const lock = acquireLock({
    instanceId,
    pid: processRef.pid,
    lockPath: servicePaths.lockPath,
    dataDir: servicePaths.dataDir,
    fsRef,
    processRef
  });
  if (!lock?.acquired) return { code: 0, reason: lock?.reason ?? 'already-running', owner: lock?.owner ?? null };

  let opened = null;
  let watchers = null;
  let runtime = null;
  const targetedStop = () => consumeStopRequest({
    instanceId,
    stopPath: servicePaths.stopPath,
    dataDir: servicePaths.dataDir,
    fsRef
  });
  const stop = () => runtime?.stop();

  try {
    opened = openDatabase({ dataDir: servicePaths.dataDir, env, fsRef });
    const health = new HealthStore(opened.repository);
    const consumeHook = () => {
      const atMs = consumeHookSignal({
        hookPath: servicePaths.hookPath,
        dataDir: servicePaths.dataDir,
        fsRef
      });
      if (atMs !== null && atMs !== undefined) health.markHookSeen({ nowMs: atMs });
      return atMs;
    };
    try { consumeHook(); } catch {}

    const coordinator = new Coordinator({
      sessionsPath: sessionPaths.sessions,
      repository: opened.repository
    });
    runtime = new Runtime({
      coordinator,
      healthStore: health,
      instanceId,
      shouldStop: targetedStop
    });
    watchers = watchSignals({
      wakePath: servicePaths.wakePath,
      hookPath: servicePaths.hookPath,
      stopPath: servicePaths.stopPath,
      sessionsPath: sessionPaths.sessions,
      fsRef,
      onWake: (reason) => runtime.wake(reason),
      onHook: () => {
        try { consumeHook(); } catch {}
        runtime.wake('hook-signal');
      },
      onStop: () => { if (targetedStop()) runtime.stop(); },
      onWatcherSeen: () => health.markWatcherSeen()
    });

    processRef.once?.('SIGTERM', stop);
    processRef.once?.('SIGINT', stop);
    const result = await runtime.run();
    return { code: 0, reason: 'stopped', instanceId, watcherCount: watchers?.count ?? 0, ...result };
  } finally {
    processRef.off?.('SIGTERM', stop);
    processRef.off?.('SIGINT', stop);
    try { watchers?.close(); } catch {}
    try { opened?.close(); } catch {}
    try {
      releaseLock({
        instanceId,
        lockPath: servicePaths.lockPath,
        dataDir: servicePaths.dataDir,
        fsRef
      });
    } catch {}
  }
}

const SELF_PATH = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF_PATH);
if (isMain) {
  runArchiveServiceProcess()
    .then((result) => { process.exitCode = Number(result?.code ?? 0); })
    .catch(() => { process.exitCode = 1; });
}
