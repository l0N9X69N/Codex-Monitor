import os from 'node:os';
import { detectAuth } from '../core/auth.js';
import { currentPlatform } from '../platform/common.js';
import { resolveCodexExecutable } from '../platform/pty.js';
import { archiveDoctorReport } from './archive-control.js';

export function doctorReport({
  env = process.env,
  platform = currentPlatform(),
  arch = process.arch,
  nodeVersion = process.version,
  stdin = process.stdin,
  stdout = process.stdout,
  monitorConfig = null,
  readArchiveHealth
} = {}) {
  const codexPath = resolveCodexExecutable({ env, platform });
  const auth = detectAuth({ env, codexPath: codexPath ?? 'codex' });
  return {
    node: nodeVersion,
    platform,
    arch,
    codexPath,
    authMode: auth.mode,
    authSource: auth.source,
    stdinTty: Boolean(stdin?.isTTY),
    stdoutTty: Boolean(stdout?.isTTY),
    archive: monitorConfig
      ? archiveDoctorReport(monitorConfig, readArchiveHealth ? { readHealth: readArchiveHealth } : {})
      : null
  };
}

export function printDoctor(report, stream = process.stdout) {
  const lines = [
    'Codex Monitor doctor',
    `Node: ${report.node} (${report.platform}/${report.arch})`,
    `Codex: ${report.codexPath ?? 'NOT FOUND'}`,
    `Auth: ${report.authMode} (${report.authSource})`,
    `TTY: stdin=${report.stdinTty ? 'yes' : 'no'} stdout=${report.stdoutTty ? 'yes' : 'no'}`
  ];
  if (report.archive) {
    lines.push(`Archive: ${report.archive.enabled ? 'Enabled' : 'Disabled'} · service=${report.archive.service} hook=${report.archive.hook} sqlite=${report.archive.sqlite} sync=${report.archive.sync}`);
    lines.push(`Archive queue: pending=${report.archive.pendingFiles} failed=${report.archive.failedFiles} sessions=${report.archive.archivedSessions}`);
    if (report.archive.error) lines.push(`Archive attention: ${report.archive.error}`);
  }
  lines.push('Privacy: diagnostics are sanitized; prompts, responses, tool output and secrets are not printed');
  stream.write(lines.join(os.EOL) + os.EOL);
}
