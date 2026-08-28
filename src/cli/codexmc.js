#!/usr/bin/env node
import process from 'node:process';
import { configureMonitor } from '../config/configure.js';
import { confirmMonitorReset } from '../config/reset-confirm.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../config/schema.js';
import { getMonitorConfigPath, loadMonitorConfig } from '../config/store.js';
import { completeHostExit } from '../platform/host-lifecycle.js';
import { parseConfigArgs } from './args.js';
import { configHelp } from './help.js';

function recoveryNotice(loaded) {
  if (!loaded?.error) return '';
  if (loaded.futureVersion) return `RECOVERY: config v${loaded.sourceVersion} is newer than supported; using safe defaults until explicit Save.`;
  return 'RECOVERY: config could not be parsed/read; original file is preserved until explicit Save.';
}

async function main() {
  const parsed = parseConfigArgs(process.argv.slice(2));
  const configPath = getMonitorConfigPath();
  const loaded = loadMonitorConfig({ filePath: configPath });
  const language = loaded?.config?.language;

  if (parsed.help) {
    process.stdout.write(configHelp(language));
    return 0;
  }

  const interactive = Boolean(process.stdin?.isTTY && process.stdout?.isTTY);
  if (!interactive) {
    process.stderr.write('codexmc: Config requires an interactive TTY.\n');
    return 2;
  }

  if (parsed.reset) {
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

  const result = await configureMonitor({
    currentConfig: loaded.config,
    previousConfig: loaded.config,
    filePath: configPath,
    notice: recoveryNotice(loaded)
  });
  return result.code;
}

main()
  .then((code) => completeHostExit(code))
  .catch((error) => {
    process.stderr.write(`codexmc: ${error?.stack ?? error}\n`);
    completeHostExit(1);
  });
