import { uninstallArchiveHooks } from '../archive/hook-config.js';
import { requestArchiveServiceStop } from '../archive/service-control.js';

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
  } catch (caught) {
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

export function printUninstallReport(report, stream = process.stdout) {
  stream.write(`Monitor-owned Archive hooks: ${report?.hooks?.removed === false ? 'FAILED' : 'removed/not present'}\n`);
  const service = report?.service;
  stream.write(`Archive Service: ${service?.requested ? 'stop requested' : 'not running'}\n`);
  stream.write('Preserved: Codex auth, Codex sessions, Monitor config, Local Session Archive database.\n');
  stream.write('Package removal is performed by your package manager (for example: npm uninstall -g codex-monitor).\n');
  if (report?.error) stream.write(`Attention: ${report.error}\n`);
}
