import process from 'node:process';
import { printUninstallReport, uninstallMonitorIntegration } from '../src/product/uninstall.js';

const report = uninstallMonitorIntegration();
printUninstallReport(report, process.stdout, { packageRemoval: false });
process.exitCode = report.ok ? 0 : 2;
