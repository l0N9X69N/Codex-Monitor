import { assertPlatformAdapter } from './contract.js';
import { createPosixMethods } from './posix.js';

export function createLinuxPlatformAdapter({ env = process.env } = {}) {
  const launchers = [
    ({ command, args }) => ({ file: 'x-terminal-emulator', args: ['-e', command, ...args] }),
    ({ command, args }) => ({ file: 'gnome-terminal', args: ['--', command, ...args] }),
    ({ command, args }) => ({ file: 'konsole', args: ['-e', command, ...args] }),
    ({ command, args }) => ({ file: 'xterm', args: ['-e', command, ...args] })
  ];
  return assertPlatformAdapter({ id: 'linux', ...createPosixMethods({ platform: 'linux', env, terminalLaunchers: launchers }) });
}
