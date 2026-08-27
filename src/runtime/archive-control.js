import { readArchiveConfigHealth } from '../manager/archive-config-panel.js';
import { reconcileArchiveNow, repairArchiveHook } from '../archive/maintenance.js';

export function archiveDoctorReport(config, { readHealth = readArchiveConfigHealth } = {}) {
  const enabled = config?.archive?.enabled === true;
  let health = null;
  let error = null;
  try {
    health = readHealth();
  } catch (caught) {
    error = caught?.message ?? String(caught);
  }
  return {
    enabled,
    service: health?.serviceRunning === true ? 'running' : 'idle',
    hook: health?.hookComplete === true ? 'installed' : health?.hookInstalled === true ? 'partial' : 'missing',
    sqlite: health?.sqliteHealthy === true ? 'healthy' : 'unavailable',
    sync: enabled ? (health?.syncLabel ?? 'unknown') : 'disabled',
    archivedSessions: Number(health?.sessions ?? 0),
    pendingFiles: Number(health?.pendingFiles ?? 0),
    failedFiles: Number(health?.failedFiles ?? 0),
    error: error ?? health?.sqliteError ?? health?.serviceError ?? health?.hookError ?? null
  };
}

export function repairMonitorIntegration(config, {
  repairHook = repairArchiveHook,
  reconcile = reconcileArchiveNow
} = {}) {
  if (config?.archive?.enabled !== true) {
    return {
      ok: true,
      changed: false,
      skipped: true,
      reason: 'archive-disabled',
      hook: null,
      reconcile: null,
      error: null
    };
  }

  const hook = repairHook();
  if (hook?.ok !== true) {
    return {
      ok: false,
      changed: false,
      skipped: false,
      reason: 'hook-repair-failed',
      hook,
      reconcile: null,
      error: hook?.error ?? 'Archive hook repair failed.'
    };
  }

  const wake = reconcile(config);
  return {
    ok: wake?.ok === true,
    changed: hook?.hooks?.changed === true,
    skipped: false,
    reason: wake?.ok === true ? 'repaired' : 'reconcile-failed',
    hook,
    reconcile: wake,
    error: wake?.error ?? null
  };
}

export function printRepairReport(report, stream = process.stdout) {
  if (report?.skipped) {
    stream.write('Archive: Disabled; no Monitor-owned hook/service repair was needed.\n');
    return;
  }
  stream.write(`Archive hook: ${report?.hook?.ok === true ? 'OK' : 'FAILED'}\n`);
  stream.write(`Archive reconcile: ${report?.reconcile?.ok === true ? 'OK' : 'FAILED'}\n`);
  if (report?.error) stream.write(`Attention: ${report.error}\n`);
  stream.write('Scope: Monitor-owned Archive integration only; Codex auth, sessions and archive data were not modified.\n');
}
