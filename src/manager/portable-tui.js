import { EventEmitter } from 'node:events';
import process from 'node:process';
import { detectHistoryColorMode } from '../history/theme.js';
import { attachTerminalKeyInput } from '../terminal/key-input.js';
import { runSessionManagerTui as runRawSessionManagerTui } from './tui.js';

function createDecodedInputProxy(stdin) {
  const proxy = new EventEmitter();
  Object.defineProperties(proxy, {
    isTTY: { enumerable: true, get: () => Boolean(stdin?.isTTY) },
    isRaw: { enumerable: true, get: () => Boolean(stdin?.isRaw) }
  });
  proxy.setRawMode = (value) => stdin?.setRawMode?.(value);
  proxy.resume = () => stdin?.resume?.();
  proxy.pause = () => stdin?.pause?.();
  return proxy;
}

function managerColorCapability(options = {}) {
  const capability = options.colorCapability ?? detectHistoryColorMode();
  const theme = String(options.theme ?? options.monitorConfig?.theme ?? 'color').toLowerCase();
  if (theme === 'cyberpunk' && capability !== 'mono' && !String(capability).startsWith('cyberpunk:')) {
    return `cyberpunk:${capability}`;
  }
  return capability;
}

export async function runPortableSessionManagerTui(options = {}) {
  const stdin = options.stdin ?? process.stdin;
  const proxy = createDecodedInputProxy(stdin);
  const detach = attachTerminalKeyInput(stdin, (raw) => {
    if (raw === '\x03') {
      proxy.emit('data', 'q');
      return;
    }
    proxy.emit('data', raw);
  });

  try {
    return await runRawSessionManagerTui({
      ...options,
      stdin: proxy,
      colorCapability: managerColorCapability(options)
    });
  } finally {
    detach();
  }
}

export { createDecodedInputProxy, managerColorCapability };
