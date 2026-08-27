import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { uninstallArchiveHooks } from '../archive/hook-config.js';
import { requestArchiveServiceStop } from '../archive/service-control.js';

export const WINDOWS_UNINSTALL_SCRIPT_PATH = fileURLToPath(new URL('../../scripts/uninstall.ps1', import.meta.url));

export function uninstallMonitorIntegration({
  uninstallHooks = uninstallArchiveHooks,
  requestStop = requestArchiveServiceStop
} = {}) {
  let hooks = null;
  let service = null;
  let error = null;

  try {
    hooks = uninstallHooks();
    if (hooks?.removed === false) error = hooks?.error ?? 'Monitor-owned Archive hook removal failed.';
  } catch {
    error = 'Monitor-owned Archive hook removal failed.';
  }

  try {
    service = requestStop();
  } catch {
    error = error ?? 'Archive Service stop request failed.';
  }

  return {
    ok: error == null,
    hooks,
    service,
    preserved: {
      codexAuth: true,
      codexSessions: true,
      archiveDatabase: true,
      monitorConfig: true
    },
    error
  };
}

export function scheduleProductRemoval({
  platform = process.platform,
  parentPid = process.pid,
  scriptPath = WINDOWS_UNINSTALL_SCRIPT_PATH,
  spawnProcess = spawn
} = {}) {
  if (platform !== 'win32') {
    return {
      scheduled: false,
      reason: 'package-manager-required',
      error: null
    };
  }

  try {
    const child = spawnProcess('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-IntegrationAlreadyClean',
      '-ParentPid', String(parentPid)
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child?.once?.('error', () => {});
    child?.unref?.();
    return {
      scheduled: true,
      reason: 'windows-uninstaller-started',
      pid: Number(child?.pid) || null,
      error: null
    };
  } catch {
    return {
      scheduled: false,
      reason: 'uninstaller-launch-failed',
      error: 'Could not start the Windows package uninstaller.'
    };
  }
}

export function printUninstallReport(report, stream = process.stdout, { packageRemoval = null } = {}) {
  stream.write(`Monitor-owned Archive hooks: ${report?.hooks?.removed === false ? 'FAILED' : 'removed/not present'}\n`);
  const service = report?.service;
  stream.write(`Archive Service: ${service?.requested ? 'stop requested' : 'not running'}\n`);
  stream.write('Preserved: Codex auth, Codex sessions, Monitor config, Local Session Archive database.\n');

  if (packageRemoval?.scheduled) {
    stream.write('Package/link removal: scheduled; codexm will be removed after this process exits.\n');
  } else if (packageRemoval?.reason === 'package-manager-required') {
    stream.write('Package/link removal: run your package manager uninstaller (for example: npm uninstall -g codex-monitor).\n');
  } else if (packageRemoval?.error) {
    stream.write(`Package/link removal: FAILED to schedule. ${packageRemoval.error}\n`);
  } else {
    stream.write('Package/link removal: not requested by this integration-cleanup operation.\n');
  }

  if (report?.error) stream.write(`Attention: ${report.error}\n`);
}
