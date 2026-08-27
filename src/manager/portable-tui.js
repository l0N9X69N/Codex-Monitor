import { EventEmitter } from 'node:events';
import process from 'node:process';
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
    return await runRawSessionManagerTui({ ...options, stdin: proxy });
  } finally {
    detach();
  }
}

export { createDecodedInputProxy };
