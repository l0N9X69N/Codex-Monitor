import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = resolve(here, 'eat_preview.txt');

function parseArgs(argv) {
  const options = {
    once: false,
    raw: false,
    speed: 1,
    source: DEFAULT_SOURCE,
  };

  for (const arg of argv) {
    if (arg === '--once') {
      options.once = true;
      continue;
    }

    if (arg === '--raw') {
      options.raw = true;
      continue;
    }

    if (arg.startsWith('--speed=')) {
      const speed = Number(arg.slice('--speed='.length));
      if (Number.isFinite(speed) && speed > 0) options.speed = speed;
      continue;
    }

    if (arg.startsWith('--source=')) {
      const source = arg.slice('--source='.length).trim();
      if (source) options.source = resolve(process.cwd(), source);
    }
  }

  return options;
}

function parseFrames(text) {
  const normalized = text.replace(/\r\n?/g, '\n');
  const header = /^FRAME\s+(\d+)\s+[—–-]\s+(.+)$/gm;
  const matches = [...normalized.matchAll(header)];

  if (matches.length === 0) {
    throw new Error('No FRAME sections found in eat_preview.txt');
  }

  return matches.map((match, index) => {
    const blockStart = match.index + match[0].length;
    const blockEnd = index + 1 < matches.length
      ? matches[index + 1].index
      : normalized.indexOf('\nNOTES FOR EDITING', blockStart) >= 0
        ? normalized.indexOf('\nNOTES FOR EDITING', blockStart)
        : normalized.length;

    let block = normalized.slice(blockStart, blockEnd);
    block = block.replace(/^\n-{10,}\n/, '');
    block = block.replace(/\n+$/g, '');

    return {
      number: Number(match[1]),
      title: match[2].trim(),
      art: block,
    };
  });
}

function delayFor(frame) {
  const title = frame.title.toUpperCase();

  if (title.includes('BLINK')) return 135;
  if (title.includes('EYES OPEN')) return 250;
  if (title.includes('FOOD APPEARS')) return 520;
  if (title.includes('FOOD CLOSER')) return 300;
  if (title.includes('EAT NOM')) return 220;
  if (title.includes('CHEW 2')) return 180;
  if (title.includes('CHEW')) return 180;
  if (title.includes('GULP')) return 430;
  if (title.includes('GROW TRANSITION')) return 520;
  if (title.includes('HAPPY WAG')) return 230;
  if (title.includes('BELLY MAX / IDLE')) return 760;
  if (title.includes('BELLY +2 / IDLE')) return 650;
  if (title.includes('BELLY +1 / IDLE')) return 650;
  if (title.includes('NORMAL / IDLE')) return 800;

  return 420;
}

function visualWidth(text) {
  return [...text].length;
}

function padRight(text, width) {
  return text + ' '.repeat(Math.max(0, width - visualWidth(text)));
}

function getLayout(frames) {
  const artRows = Math.max(...frames.map((frame) => frame.art.split('\n').length));
  const artWidth = Math.max(
    ...frames.flatMap((frame) => frame.art.split('\n').map(visualWidth)),
  );
  const stateWidth = Math.max(
    ...frames.map((frame) => visualWidth(`FRAME ${String(frame.number).padStart(2, '0')}  ${frame.title}`)),
  );

  return {
    width: Math.max(50, artWidth, stateWidth),
    artRows,
  };
}

function renderBox(frame, layout, totalFrames) {
  const { width, artRows } = layout;
  const artLines = frame.art.split('\n');
  const label = `FRAME ${String(frame.number).padStart(2, '0')}/${String(totalFrames).padStart(2, '0')}  ${frame.title}`;
  const title = ' MINI CODEX DOG · EAT ';
  const top = `╭${title}${'─'.repeat(Math.max(0, width - visualWidth(title)))}╮`;
  const divider = `├${'─'.repeat(width)}┤`;
  const bottom = `╰${'─'.repeat(width)}╯`;
  const lines = [
    top,
    `│${padRight(label, width)}│`,
    divider,
  ];

  for (const line of artLines) {
    lines.push(`│${padRight(line, width)}│`);
  }

  for (let row = artLines.length; row < artRows; row += 1) {
    lines.push(`│${' '.repeat(width)}│`);
  }

  lines.push(bottom);
  return lines.join('\n');
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const preview = await readFile(options.source, 'utf8');
  const frames = parseFrames(preview);
  const layout = getLayout(frames);
  const isTty = Boolean(process.stdout.isTTY);
  let stopped = false;

  const restoreTerminal = () => {
    if (isTty) process.stdout.write('\x1b[?25h');
  };

  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });

  process.on('SIGINT', () => {
    stopped = true;
    restoreTerminal();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    stopped = true;
    restoreTerminal();
    process.exit(143);
  });

  process.on('exit', restoreTerminal);

  if (isTty) {
    process.stdout.write('\x1b[?25l\x1b[2J\x1b[H');
  }

  do {
    for (const frame of frames) {
      if (stopped) break;

      const output = options.raw
        ? frame.art
        : renderBox(frame, layout, frames.length);

      if (isTty) {
        process.stdout.write(`\x1b[H${output}\x1b[J`);
      } else {
        process.stdout.write(`${output}\n\n`);
      }

      const delay = Math.max(35, Math.round(delayFor(frame) / options.speed));
      await sleep(delay);
    }

    if (!options.once && !stopped) {
      await sleep(Math.max(100, Math.round(1100 / options.speed)));
    }
  } while (!options.once && !stopped);
}

main().catch((error) => {
  process.stderr.write(`eat animation error: ${error.message}\n`);
  process.exitCode = 1;
});
