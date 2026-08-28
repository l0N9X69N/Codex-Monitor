#!/usr/bin/env node
import process from 'node:process';
import { kickArchiveService } from '../archive/integration.js';
import { runFirstRunOnboarding } from '../config/onboarding-tui.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../config/schema.js';
import { loadMonitorConfig, getMonitorConfigPath } from '../config/store.js';
import { createPlatformAdapter } from '../platform/index.js';
import { completeHostExit } from '../platform/host-lifecycle.js';
import { runSessionManagerRuntime } from '../manager/runtime.js';
import { runPortableSessionManagerTui } from '../manager/portable-tui.js';
import { parseManagerArgs } from './args.js';
import { managerHelp } from './help.js';

function recoveryNotice(loaded) {
  if (!loaded?.error) return '';
  if (loaded.futureVersion) return `RECOVERY: config v${loaded.sourceVersion} is newer than supported; using safe defaults until explicit Save.`;
  return 'RECOVERY: config could not be parsed/read; original file is preserved until explicit Save.';
}

async function main() {
  const parsed = parseManagerArgs(process.argv.slice(2));
  const configPath = getMonitorConfigPath();
  const loaded = loadMonitorConfig({ filePath: configPath });
  let config = loaded.config;
  if (parsed.help) {
    process.stdout.write(managerHelp(config?.language));
    return 0;
  }

  const platformAdapter = createPlatformAdapter();
  const interactive = Boolean(process.stdin?.isTTY && process.stdout?.isTTY);

  if (interactive && config?.setupComplete !== true) {
    const onboarding = await runFirstRunOnboarding({
      currentConfig: loaded.valid ? config : normalizeConfig(DEFAULT_CONFIG),
      previousConfig: loaded.valid ? config : normalizeConfig(DEFAULT_CONFIG),
      filePath: configPath,
      notice: recoveryNotice(loaded)
    });
    if (!onboarding.saved) return onboarding.code ?? 1;
    config = onboarding.config;
  }

  kickArchiveService(config);
  const result = interactive
    ? await runPortableSessionManagerTui({
      platformAdapter,
      theme: config.theme,
      monitorConfig: config,
      configPath,
      initialViewMode: parsed.view ?? config.manager?.view ?? 'operations'
    })
    : await runSessionManagerRuntime({ platformAdapter });
  return result.code;
}

main()
  .then((code) => completeHostExit(code))
  .catch((error) => {
    process.stderr.write(`codexmm: ${error?.stack ?? error}\n`);
    completeHostExit(1);
  });
