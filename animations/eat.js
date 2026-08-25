import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = {
    once: false,
    raw: false,
    speed: 1,
    source: resolve(here, 'eat_preview.txt'),
  };

  for (const arg of argv) {
    if (arg === '--once') {
      options.once = true;
    } else if (arg === '--raw') {
      options.raw = true;
    } else if (arg.startsWith('--speed=')) {
      const value = Number(arg.slice('--speed='.length));
      if (Number.isFinite(value) && value > 0) options.speed = value;
    } else if (arg.startsWith('--source=')) {
      options.source = resolve(process.cwd(), arg.slice('--source='.length));
    }
  }

  return options;
}

function parseFrames(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const frameRe = /FRAME\s+(\d+)\s+[—–-]\s+([^\n]+)\n-{10,}\n([\s\S]*?)(?=\n{2,}FRAME\s+\d+\s+[—–-]\s+|\n{2,}NOTES FOR EDITING|$)/g;
  const frames = [];

  for (const match of normalized.matchAll(frameRe)) {
    frames.push({
      number: Number(match[1]),
      title: match[2].trim(),
      art: match[3].replace(/\n+$/g, ''),
    });
  }

  if (frames.length === 0) {
    throw new Error('No FRAME sections found in eat_preview.txt');
  }

  return frames;
}

function frameDelay(frame) {
  const title = frame.title.toUpperCase();

  if (title.includes('BLINK')) return 150;
  if (title.includes('EYES OPEN')) return 280;
  if (title.includes('FOOD APPEARS')) return 550;
  if (title.includes('FOOD CLOSER')) return 330;
  if (title.includes('NOM')) return 240;
  if (title.includes('CHEW')) return 190;
  if (title.includes('GULP')) return 420;
  if (title.includes('GROW')) return 460;
  if (title.includes('HAPPY WAG')) return 240;
  if (title.includes('BELLY MAX')) return 700;

  return 650;
}

function getCanvasWidth(frames) {
  const artWidth = Math.max(
    0,
    ...frames.flatMap((frame) => frame.art.split('\n').map((line) => line.length)),
  );
  const stateWidth = Math.max(
    0,
    ...frames.map((frame) => `FRAME ${String(frame.number).padStart(2, '0')}  ${frame.title}`.length),
  );

  return Math.max(50, artWidth, stateWidth);
}

function padRight(line, width) {
  return line + ' '.repeat(Math.max(0, width - line.length));
}

function renderBox(frame, width, artRows) {
  const artLines = frame.art.split('\n');
  const state = `FRAME ${String(frame.number).padStart(2, '0')}  ${frame.title}`;
  const title = ' MINI CODEX DOG · EAT ';
  const top = `╭${title}${'─'.repeat(Math.max(0, width - title.length))}╮`;
  const divider = `├${'─'.repeat(width)}┤`;
  const bottom = `╰${'─'.repeat(width)}╯`;
  const lines = [top, `│${padRight(state, width)}│`, divider];

  for (const line of artLines) {
    lines.push(`│${padRight(line, width)}│`);
  }

  for (let i = artLines.length; i < artRows; i += 1) {
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
  const text = await readFile(options.source, 'utf8');
  const frames = parseFrames(text);
  const width = getCanvasWidth(frames);
  const artRows = Math.max(...frames.map((frame) => frame.art.split('\n').length));
  const isTty = Boolean(process.stdout.isTTY);
  let running = true;

  const cleanup = () => {
    if (isTty) process.stdout.write('\x1b[?25h');
  };

  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });

  process.on('SIGINT', () => {
    running = false;
    cleanup();
    process.exit(130);
  });
  process.on('exit', cleanup);

  if (isTty) {
    process.stdout.write('\x1b[?25l\x1b[2J\x1b[H');
  }

  do {
    for (const frame of frames) {
      if (!running) break;

      const output = options.raw
        ? frame.art
        : renderBox(frame, width, artRows);

      if (isTty) {
        process.stdout.write(`\x1b[H${output}\x1b[J`);
      } else {
        process.stdout.write(`${output}\n\n`);
      }

      const delay = Math.max(40, Math.round(frameDelay(frame) / options.speed));
      await sleep(delay);
    }

    if (!options.once && running) {
      await sleep(Math.max(80, Math.round(700 / options.speed)));
    }
  } while (running && !options.once);
}

main().catch((error) => {
  process.stderr.write(`eat animation error: ${error.message}\n`);
  process.exitCode = 1;
});
