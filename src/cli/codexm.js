#!/usr/bin/env node
import process from 'node:process';
import { kickArchiveService } from '../archive/integration.js';
import { detectAuth } from '../core/auth.js';
import { createCurrentRunState, withDetectedAuth } from '../core/state.js';
import { applyRuntimeOverrides, DEFAULT_CONFIG, normalizeConfig } from '../config/schema.js';
import { configureMonitor } from '../config/configure.js';
import { runFirstRunOnboarding } from '../config/onboarding-tui.js';
import { shouldRunFirstRunOnboarding } from '../config/onboarding.js';
import { confirmMonitorReset } from '../config/reset-confirm.js';
import { getMonitorConfigPath, loadMonitorConfig } from '../config/store.js';
import { completeHostExit } from '../platform/host-lifecycle.js';
import { resolveCodexExecutable } from '../platform/pty.js';
import { createPlatformAdapter } from '../platform/index.js';
import { printRepairReport, repairMonitorIntegration } from '../runtime/archive-control.js';
import { doctorReport, printDoctor } from '../runtime/doctor.js';
import { runCodexLive } from '../runtime/live-runner.js';
import { codexArgsForLocalResume, localResumePickerIntent, pickLocalResumeSession } from '../runtime/local-resume-picker.js';
import { runSessionManagerRuntime } from '../manager/runtime.js';
import { runPortableSessionManagerTui } from '../manager/portable-tui.js';
import { renderDemo } from '../ui/demo.js';
import { parseMonitorArgs } from './args.js';

const VERSION = '1.0.0-alpha.1';

function configRecoveryNotice(loaded) {
  if (!loaded?.error) return '';
  if (loaded.futureVersion) return `RECOVERY: config v${loaded.sourceVersion} is newer than supported; using safe defaults until explicit Save.`;
  return 'RECOVERY: config could not be parsed/read; original file is preserved until explicit Save.';
}

function printHelp() {
  process.stdout.write(`Codex Monitor ${VERSION}\n\n`);
  process.stdout.write('LIVE / CODEX\n');
  process.stdout.write('  codexm [monitor options] [codex arguments]\n');
  process.stdout.write('  --auth auto|api|login         Auth detection/override\n');
  process.stdout.write('  --preset recommended|compact|full|custom\n');
  process.stdout.write('  --theme color|mono|matrix\n');
  process.stdout.write('  --background terminal|black|dark\n');
  process.stdout.write('  --lang vi|en\n\n');
  process.stdout.write('SESSION MANAGER\n');
  process.stdout.write('  --manager                     Open Session Manager\n');
  process.stdout.write('  --manager-view operations|table|charts|auto\n');
  process.stdout.write('                                Override Manager view for this run only\n');
  process.stdout.write('  Inside Manager: C Config · P/M preview inside Config\n\n');
  process.stdout.write('CUSTOMIZE\n');
  process.stdout.write('  --configure                   Open the shared Monitor Config screen\n');
  process.stdout.write('  --reset                       Confirm reset, then open Config with defaults\n');
  process.stdout.write('  Config: P Live preview · M Manager preview\n\n');
  process.stdout.write('DIAGNOSTICS\n');
  process.stdout.write('  --doctor                      Run sanitized diagnostics, including Archive health\n');
  process.stdout.write('  --repair                      Repair Monitor-owned Archive hook/service integration\n');
  process.stdout.write('  --config                      Show effective Monitor config\n');
  process.stdout.write('  --config-path                 Show Monitor config path\n');
  process.stdout.write('  --monitor-version             Show Codex Monitor version\n');
  process.stdout.write('  --demo                        Render passive Live HUD demo\n');
  process.stdout.write('  --demo-state idle|thinking|tool|approval|error\n\n');
  process.stdout.write('PASSTHROUGH\n');
  process.stdout.write('  --                            Stop Monitor option parsing; pass remainder to Codex\n\n');
  process.stdout.write('A clean interactive first launch runs setup before Manager or official Codex starts.\n');
  process.stdout.write('Live Monitor is passive after Codex starts: every keyboard byte belongs to official Codex.\n');
  process.stdout.write('Unknown Codex arguments are forwarded; use -- for an exact passthrough boundary.\n');
  process.stdout.write('Local Session Archive is optional/local-only and remains disabled until explicit opt-in.\n');
  process.stdout.write('--repair never deletes Codex sessions/archive data and only touches Monitor-owned Archive integration.\n');
  process.stdout.write('There is no public Monitor-owned --history mode in v1.\n');
  process.stdout.write('Example: codexm -- --help   # official Codex help\n');
}

async function main() {
  const parsed = parseMonitorArgs(process.argv.slice(2));
  const platformAdapter = createPlatformAdapter();
  const configPath = getMonitorConfigPath();
  const loaded = loadMonitorConfig({ filePath: configPath });
  let persistedConfig = loaded.config;
  let config = applyRuntimeOverrides(persistedConfig, parsed.overrides);
  const interactive = Boolean(process.stdin?.isTTY && process.stdout?.isTTY);
  const recoveryNotice = configRecoveryNotice(loaded);

  if (loaded.error) process.stderr.write(`codexm: config could not be used; original file preserved (${loaded.error.message}).\n`);

  if (parsed.action === 'help') { printHelp(); return 0; }
  if (parsed.action === 'monitor-version') { process.stdout.write(`${VERSION}\n`); return 0; }
  if (parsed.action === 'doctor') {
    const report = doctorReport({ monitorConfig: loaded.config });
    printDoctor(report);
    return report.codexPath ? 0 : 2;
  }
  if (parsed.action === 'repair') {
    const report = repairMonitorIntegration(loaded.config);
    printRepairReport(report);
    return report.ok ? 0 : 2;
  }
  if (parsed.action === 'config-path') { process.stdout.write(`${configPath}\n`); return 0; }
  if (parsed.action === 'config') { process.stdout.write(`${JSON.stringify(config, null, 2)}\n`); return 0; }
  if (parsed.action === 'configure') {
    const result = await configureMonitor({
      currentConfig: loaded.config,
      previousConfig: loaded.config,
      filePath: configPath,
      notice: recoveryNotice
    });
    return result.code;
  }
  if (parsed.action === 'reset') {
    const confirmation = await confirmMonitorReset({ archiveEnabled: loaded.config?.archive?.enabled === true });
    if (!confirmation.confirmed) return confirmation.code ?? 1;
    const result = await configureMonitor({
      currentConfig: normalizeConfig(DEFAULT_CONFIG),
      previousConfig: loaded.config,
      filePath: configPath,
      notice: 'RESET DRAFT: defaults loaded. Nothing changes until you press S to Save.'
    });
    return result.code;
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

  if (shouldRunFirstRunOnboarding({ action: parsed.action, interactive, loaded })) {
    const onboarding = await runFirstRunOnboarding({
      currentConfig: loaded.valid ? loaded.config : normalizeConfig(DEFAULT_CONFIG),
      previousConfig: loaded.valid ? loaded.config : normalizeConfig(DEFAULT_CONFIG),
      filePath: configPath,
      notice: recoveryNotice
    });
    if (!onboarding.saved) return onboarding.code ?? 1;
    persistedConfig = onboarding.config;
    config = applyRuntimeOverrides(persistedConfig, parsed.overrides);
  }

  if (parsed.action === 'manager') {
    kickArchiveService(config);
    const result = interactive
      ? await runPortableSessionManagerTui({
        platformAdapter,
        theme: config.theme,
        monitorConfig: persistedConfig,
        configPath,
        initialViewMode: config.manager?.view ?? 'operations'
      })
      : await runSessionManagerRuntime({ platformAdapter });
    return result.code;
  }

  const codexPath = resolveCodexExecutable();
  if (!codexPath) {
    process.stderr.write('codexm: official Codex CLI was not found on PATH.\n');
    return 2;
  }

  kickArchiveService(config);

  let codexArgs = parsed.codexArgs;
  let resumeTargetPath = null;
  const localResume = localResumePickerIntent(codexArgs);
  if (localResume) {
    const sessionsPath = platformAdapter.paths()?.sessions ?? null;
    const picked = await pickLocalResumeSession({
      sessionsPath,
      cwd: process.cwd(),
      showAll: localResume.showAll
    });

    if (!picked.selected && picked.reason !== 'no-local-sessions') return 0;

    if (picked.selected) {
      codexArgs = codexArgsForLocalResume(codexArgs, picked.selected.threadId);
      resumeTargetPath = picked.selected.filePath;
    } else {
      process.stderr.write('codexm: no matching local sessions found; falling back to official Codex resume picker.\n');
    }
  }

  const codexArgsFinal = codexArgs;
  let state = createCurrentRunState({ startedAtMs: Date.now() });
  const auth = detectAuth({ override: parsed.auth, codexPath });
  state = withDetectedAuth(state, auth);

  return await runCodexLive({
    codexPath,
    codexArgs: codexArgsFinal,
    resumeTargetPath,
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