#!/usr/bin/env node
import process from 'node:process';
import { kickArchiveService } from '../archive/integration.js';
import { loadMonitorConfig, getMonitorConfigPath } from '../config/store.js';
import { createPlatformAdapter } from '../platform/index.js';
import { completeHostExit } from '../platform/host-lifecycle.js';
import { runSessionManagerRuntime } from '../manager/runtime.js';
import { runPortableSessionManagerTui } from '../manager/portable-tui.js';
import { parseManagerArgs } from './args.js';
import { managerHelp } from './help.js';

async function main() {
  const parsed = parseManagerArgs(process.argv.slice(2));
  const loaded = loadMonitorConfig();
  const config = loaded.config;
  if (parsed.help) {
    process.stdout.write(managerHelp(config?.language));
    return 0;
  }

  const platformAdapter = createPlatformAdapter();
  const interactive = Boolean(process.stdin?.isTTY && process.stdout?.isTTY);
  kickArchiveService(config);
  const result = interactive
    ? await runPortableSessionManagerTui({
      platformAdapter,
      theme: config.theme,
      monitorConfig: config,
      configPath: getMonitorConfigPath(),
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
