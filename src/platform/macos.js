import { assertPlatformAdapter } from './contract.js';
import { createPosixMethods } from './posix.js';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

export function createMacOSPlatformAdapter({ env = process.env } = {}) {
  const launchers = [
    ({ command, args, cwd }) => {
      const shell = `cd ${shellQuote(cwd)}; exec ${[command, ...args].map(shellQuote).join(' ')}`;
      return {
        file: 'osascript',
        args: ['-e', `tell application "Terminal" to do script ${JSON.stringify(shell)}`, '-e', 'tell application "Terminal" to activate']
      };
    }
  ];
  return assertPlatformAdapter({ id: 'darwin', ...createPosixMethods({ platform: 'darwin', env, terminalLaunchers: launchers }) });
}
