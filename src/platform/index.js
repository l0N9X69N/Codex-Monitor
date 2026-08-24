import { createWindowsPlatformAdapter } from './windows.js';
import { createLinuxPlatformAdapter } from './linux.js';
import { createMacOSPlatformAdapter } from './macos.js';

export function createPlatformAdapter({ platform = process.platform, env = process.env } = {}) {
  if (platform === 'win32') return createWindowsPlatformAdapter({ env });
  if (platform === 'linux') return createLinuxPlatformAdapter({ env });
  if (platform === 'darwin') return createMacOSPlatformAdapter({ env });
  throw new Error(`unsupported platform: ${platform}`);
}
