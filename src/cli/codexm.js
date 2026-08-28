#!/usr/bin/env node
import process from 'node:process';
import { kickArchiveService } from '../archive/integration.js';
import { detectAuth } from '../core/auth.js';
import { createCurrentRunState, withDetectedAuth } from '../core/state.js';
import { normalizeConfig, DEFAULT_CONFIG } from '../config/schema.js';
import { runFirstRunOnboarding } from '../config/onboarding-tui.js';
import { getMonitorConfigPath, loadMonitorConfig } from '../config/store.js';
import { completeHostExit } from '../platform/host-lifecycle.js';
import { resolveCodexExecutable } from '../platform/pty.js';
import { createPlatformAdapter } from '../platform/index.js';
import { scheduleBackgroundUpdateCheck } from '../product/update-scheduler.js';
import { runCodexLive } from '../runtime/live-runner.js';
import { codexArgsForLocalResume, localResumePickerIntent, pickLocalResumeSession } from '../runtime/local-resume-picker.js';
import { parseMonitorArgs } from './args.js';

function configRecoveryNotice(loaded) {
  if (!loaded?.error) return '';
  if (loaded.futureVersion) return `RECOVERY: config v${loaded.sourceVersion} is newer than supported; using safe defaults until explicit Save.`;
  return 'RECOVERY: config could not be parsed/read; original file is preserved until explicit Save.';
}

function configErrorNotice(loaded) {
  if (!loaded?.error) return '';
  if (loaded.futureVersion) return `codexm: Monitor config version ${loaded.sourceVersion} is newer than this build; original file preserved.\n`;
  if (loaded.error instanceof SyntaxError) return 'codexm: Monitor config JSON is malformed; original file preserved.\n';
  if (loaded.error?.code === 'EACCES' || loaded.error?.code === 'EPERM') return 'codexm: Monitor config could not be read due to permissions; original file preserved.\n';
  return 'codexm: Monitor config could not be read; original file preserved.\n';
}

async function main() {
  const parsed = parseMonitorArgs(process.argv.slice(2));
  const platformAdapter = createPlatformAdapter();
  const configPath = getMonitorConfigPath();
  const loaded = loadMonitorConfig({ filePath: configPath });
  let config = loaded.config;
  const interactive = Boolean(process.stdin?.isTTY && process.stdout?.isTTY);
  const recoveryNotice = configRecoveryNotice(loaded);

  if (loaded.error) process.stderr.write(configErrorNotice(loaded));

  // First-run setup is only allowed for the bare `codexm` command. Any Codex
  // argument, including -h/-v/-m/--help/--version, must pass through exactly
  // as it would when invoking official Codex directly.
  if (interactive && parsed.codexArgs.length === 0 && loaded?.config?.setupComplete !== true) {
    const onboarding = await runFirstRunOnboarding({
      currentConfig: loaded.valid ? loaded.config : normalizeConfig(DEFAULT_CONFIG),
      previousConfig: loaded.valid ? loaded.config : normalizeConfig(DEFAULT_CONFIG),
      filePath: configPath,
      notice: recoveryNotice
    });
    if (!onboarding.saved) return onboarding.code ?? 1;
    config = onboarding.config;
  }

  scheduleBackgroundUpdateCheck(config);

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

  let state = createCurrentRunState({ startedAtMs: Date.now() });
  const auth = detectAuth({ override: 'auto', codexPath });
  state = withDetectedAuth(state, auth);

  return await runCodexLive({
    codexPath,
    codexArgs,
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
