#!/usr/bin/env node
import process from 'node:process';
import { detectAuth } from '../core/auth.js';
import { createCurrentRunState, withDetectedAuth } from '../core/state.js';
import { resolveCodexExecutable } from '../platform/pty.js';
import { doctorReport, printDoctor } from '../runtime/doctor.js';
import { runCodexLive } from '../runtime/live-runner.js';
import { parseMonitorArgs } from './args.js';

const VERSION = '1.0.0-alpha.1';

function printHelp() {
  process.stdout.write(`Codex Monitor ${VERSION}\n\n`);
  process.stdout.write('Usage: codexm [monitor options] [codex arguments]\n\n');
  process.stdout.write('Monitor options implemented in Phase 01:\n');
  process.stdout.write('  --help                 Show Monitor help\n');
  process.stdout.write('  --doctor               Run sanitized Phase 01 diagnostics\n');
  process.stdout.write('  --monitor-version      Show Codex Monitor version\n');
  process.stdout.write('  --auth auto|api|login  Auth detection/override for this invocation\n');
  process.stdout.write('  --                     Stop Monitor option parsing; pass remainder to Codex\n\n');
  process.stdout.write('Example: codexm -- --help   # official Codex help\n');
}

async function main() {
  const parsed = parseMonitorArgs(process.argv.slice(2));

  if (parsed.action === 'help') {
    printHelp();
    return 0;
  }
  if (parsed.action === 'monitor-version') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.action === 'doctor') {
    const report = doctorReport();
    printDoctor(report);
    return report.codexPath ? 0 : 2;
  }

  const codexPath = resolveCodexExecutable();
  if (!codexPath) {
    process.stderr.write('codexm: official Codex CLI was not found on PATH.\n');
    return 2;
  }

  let state = createCurrentRunState({ startedAtMs: Date.now() });
  const auth = detectAuth({ override: parsed.auth, codexPath });
  state = withDetectedAuth(state, auth);

  // Phase 01 deliberately does not draw a HUD yet. The state exists so every
  // later phase starts from current-run-only semantics instead of legacy data.
  void state;

  return await runCodexLive({
    codexPath,
    codexArgs: parsed.codexArgs,
    auth
  });
}

main()
  .then((code) => { process.exitCode = Number.isFinite(code) ? code : 0; })
  .catch((error) => {
    process.stderr.write(`codexm: ${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
