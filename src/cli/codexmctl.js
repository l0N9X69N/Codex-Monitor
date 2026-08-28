#!/usr/bin/env node
import process from 'node:process';
import { getMonitorConfigPath, loadMonitorConfig } from '../config/store.js';
import { completeHostExit } from '../platform/host-lifecycle.js';
import { PRODUCT_VERSION } from '../product/meta.js';
import { checkForUpdates, printUpdateReport } from '../product/update.js';
import { printRepairReport, repairMonitorIntegration } from '../runtime/archive-control.js';
import { doctorReport, printDoctor } from '../runtime/doctor.js';
import { renderDemo } from '../ui/demo.js';
import { parseControlArgs } from './args.js';
import { controlHelp } from './help.js';

async function main() {
  const parsed = parseControlArgs(process.argv.slice(2));
  const configPath = getMonitorConfigPath();
  const loaded = loadMonitorConfig({ filePath: configPath });
  const config = loaded.config;

  if (parsed.command === 'help') {
    process.stdout.write(controlHelp(config?.language));
    return 0;
  }
  if (parsed.command === 'version') {
    process.stdout.write(`${PRODUCT_VERSION}\n`);
    return 0;
  }
  if (parsed.command === 'doctor') {
    const report = doctorReport({ monitorConfig: config });
    printDoctor(report);
    return report.codexPath ? 0 : 2;
  }
  if (parsed.command === 'repair') {
    const report = repairMonitorIntegration(config);
    printRepairReport(report);
    return report.ok ? 0 : 2;
  }
  if (parsed.command === 'update') {
    const report = await checkForUpdates();
    printUpdateReport(report);
    return 0;
  }
  if (parsed.command === 'config-path') {
    process.stdout.write(`${configPath}\n`);
    return 0;
  }
  if (parsed.command === 'config') {
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return 0;
  }
  if (parsed.command === 'demo') {
    const width = Math.max(20, process.stdout.columns || 100);
    const height = Math.max(8, process.stdout.rows || 30);
    const frame = renderDemo({
      state: parsed.demoState,
      config,
      width,
      height,
      authMode: 'login',
      cwd: process.cwd()
    });
    process.stdout.write(`${frame.lines.join('\n')}\n`);
    return 0;
  }

  process.stdout.write(controlHelp(config?.language));
  return 0;
}

main()
  .then((code) => completeHostExit(code))
  .catch((error) => {
    process.stderr.write(`codexmctl: ${error?.stack ?? error}\n`);
    completeHostExit(1);
  });
