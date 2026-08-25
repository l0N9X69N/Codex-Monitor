import readline from 'node:readline';

readline.emitKeypressEvents(process.stdin);

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

console.log('Press Alt+Left / Alt+Right. Ctrl+C to exit.');

process.stdin.on('keypress', (str, key) => {
  console.log({
    str: JSON.stringify(str),
    name: key?.name,
    meta: key?.meta,
    ctrl: key?.ctrl,
    shift: key?.shift,
    sequence: JSON.stringify(key?.sequence),
  });

  if (key?.ctrl && key?.name === 'c') {
    process.exit(0);
  }
});