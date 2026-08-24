import os from 'node:os';
import { detectAuth } from '../core/auth.js';
import { resolveCodexExecutable } from '../platform/pty.js';

export function doctorReport({
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  nodeVersion = process.version,
  stdin = process.stdin,
  stdout = process.stdout
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
    stdoutTty: Boolean(stdout?.isTTY)
  };
}

export function printDoctor(report, stream = process.stdout) {
  const lines = [
    'Codex Monitor Phase 01 doctor',
    `Node: ${report.node} (${report.platform}/${report.arch})`,
    `Codex: ${report.codexPath ?? 'NOT FOUND'}`,
    `Auth: ${report.authMode} (${report.authSource})`,
    `TTY: stdin=${report.stdinTty ? 'yes' : 'no'} stdout=${report.stdoutTty ? 'yes' : 'no'}`,
    'Secrets: not printed'
  ];
  stream.write(lines.join(os.EOL) + os.EOL);
}
