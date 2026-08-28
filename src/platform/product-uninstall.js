import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const WINDOWS_UNINSTALL_SCRIPT_PATH = fileURLToPath(new URL('../../scripts/uninstall.ps1', import.meta.url));

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
