#!/usr/bin/env node
import process from 'node:process';
import { detectAuth } from '../core/auth.js';
import { createCurrentRunState, withDetectedAuth } from '../core/state.js';
import { applyRuntimeOverrides, DEFAULT_CONFIG } from '../config/schema.js';
import { configureMonitor } from '../config/configure.js';
import { getMonitorConfigPath, loadMonitorConfig, resetMonitorConfig } from '../config/store.js';
import { completeHostExit } from '../platform/host-lifecycle.js';
import { resolveCodexExecutable } from '../platform/pty.js';
import { createPlatformAdapter } from '../platform/index.js';
import { HistoryEngine } from '../history/engine.js';
import { runHistoryTui } from '../history/app.js';
import { doctorReport, printDoctor } from '../runtime/doctor.js';
import { runCodexLive } from '../runtime/live-runner.js';
import { renderDemo } from '../ui/demo.js';
import { parseMonitorArgs } from './args.js';

const VERSION = '1.0.0-alpha.1';

function printHelp() {
  process.stdout.write(`Codex Monitor ${VERSION}\n\n`);
  process.stdout.write('Usage: codexm [monitor options] [codex arguments]\n\n');
  process.stdout.write('Monitor options:\n');
  process.stdout.write('  --help                        Show Monitor help\n');
  process.stdout.write('  --history                     Open local full-screen History viewer\n');
  process.stdout.write('  --doctor                      Run sanitized diagnostics\n');
  process.stdout.write('  --monitor-version             Show Codex Monitor version\n');
  process.stdout.write('  --auth auto|api|login         Auth detection/override\n');
  process.stdout.write('  --preset recommended|compact|full|custom\n');
  process.stdout.write('  --theme color|mono|matrix\n');
  process.stdout.write('  --lang vi|en\n');
  process.stdout.write('  --configure                   Interactive Monitor setup\n');
  process.stdout.write('  --reset                       Reset Monitor config and rerun setup\n');
  process.stdout.write('  --config                      Show effective Monitor config\n');
  process.stdout.write('  --config-path                 Show Monitor config path\n');
  process.stdout.write('  --demo                        Render Live Monitor demo\n');
  process.stdout.write('  --demo-state idle|thinking|tool|approval|error\n');
  process.stdout.write('  --                            Stop Monitor option parsing; pass remainder to Codex\n\n');
  process.stdout.write('Live: Alt+Left/Right changes configured view; F4 opens History in another terminal.\n');
  process.stdout.write('Example: codexm -- --help   # official Codex help\n');
}

async function main() {
  const parsed = parseMonitorArgs(process.argv.slice(2));
  const platformAdapter = createPlatformAdapter();
  const configPath = getMonitorConfigPath();
  const loaded = loadMonitorConfig({ filePath: configPath });
  const config = applyRuntimeOverrides(loaded.config, parsed.overrides);

  if (loaded.error) process.stderr.write(`codexm: config could not be read; using defaults (${loaded.error.message}).\n`);

  if (parsed.action === 'help') { printHelp(); return 0; }
  if (parsed.action === 'history') {
    const sessionsPath = platformAdapter.paths()?.sessions;
    const engine = new HistoryEngine({ sessionsPath });
    return await runHistoryTui({ engine });
  }
  if (parsed.action === 'monitor-version') { process.stdout.write(`${VERSION}\n`); return 0; }
  if (parsed.action === 'doctor') {
    const report = doctorReport();
    printDoctor(report);
    return report.codexPath ? 0 : 2;
  }
  if (parsed.action === 'config-path') { process.stdout.write(`${configPath}\n`); return 0; }
  if (parsed.action === 'config') { process.stdout.write(`${JSON.stringify(config, null, 2)}\n`); return 0; }
  if (parsed.action === 'configure') {
    const result = await configureMonitor({ currentConfig: loaded.config, filePath: configPath });
    return result.saved ? 0 : 1;
  }
  if (parsed.action === 'reset') {
    const reset = resetMonitorConfig({ filePath: configPath });
    const result = await configureMonitor({ currentConfig: reset ?? DEFAULT_CONFIG, filePath: configPath });
    return result.saved ? 0 : 1;
  }
  if (parsed.action === 'demo') {
    const width = Math.max(20, process.stdout.columns || 100);
    const height = Math.max(8, process.stdout.rows || 30);
    const frame = renderDemo({
      state: parsed.demo.state,
      config,
      width,
      height,
      authMode: parsed.auth === 'api' ? 'api' : 'login',
      cwd: process.cwd()
    });
    process.stdout.write(`${frame.lines.join('\n')}\n`);
    return 0;
  }

  const codexPath = resolveCodexExecutable();
  if (!codexPath) {
    process.stderr.write('codexm: official Codex CLI was not found on PATH.\n');
    return 2;
  }

  let state = createCurrentRunState({ startedAtMs: Date.now() });
  const auth = detectAuth({ override: parsed.auth, codexPath });
  state = withDetectedAuth(state, auth);

  return await runCodexLive({
    codexPath,
    codexArgs: parsed.codexArgs,
    auth,
    monitorState: state,
    monitorConfig: config,
    platformAdapter
  });
}

main()
  .then((code) => { completeHostExit(code); })
  .catch((error) => {
    process.stderr.write(`codexm: ${error?.stack ?? error}\n`);
    completeHostExit(1);
  });
