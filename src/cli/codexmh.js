#!/usr/bin/env node
import process from 'node:process';
import { loadMonitorConfig } from '../config/store.js';
import { completeHostExit } from '../platform/host-lifecycle.js';
import { monitorHelp } from './help.js';

function main() {
  const loaded = loadMonitorConfig();
  process.stdout.write(monitorHelp(loaded?.config?.language));
  return 0;
}

try {
  completeHostExit(main());
} catch (error) {
  process.stderr.write(`codexmh: ${error?.stack ?? error}\n`);
  completeHostExit(1);
}
