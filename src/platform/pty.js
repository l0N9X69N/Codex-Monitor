import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function quoteWindowsCmdArg(value) {
  if (value === '') return '""';
  let text = String(value).replace(/%/g, '%%');
  text = text.replace(/([&|<>^])/g, '^$1');
  if (!/[\s"&|<>^()]/.test(text)) return text;
  text = text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1');
  return `"${text}"`;
}

function resolveCodexOnWindows({ env = process.env, argv1 = process.argv[1] } = {}) {
  try {
    const output = execFileSync('where.exe', ['codex'], { encoding: 'utf8', windowsHide: true, env });
    const paths = output.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const selfShim = path.resolve(argv1 ?? '').toLowerCase();
    const candidates = paths.filter((p) => path.resolve(p).toLowerCase() !== selfShim);
    return candidates.find((p) => /\.exe$/i.test(p))
      ?? candidates.find((p) => /\.(cmd|bat)$/i.test(p))
      ?? candidates[0]
      ?? null;
  } catch {
    return null;
  }
}

export function resolveCodexExecutable({
  env = process.env,
  platform = process.platform,
  argv1 = process.argv[1]
} = {}) {
  if (env.CODEXM_CODEX) return env.CODEXM_CODEX;
  if (platform === 'win32') return resolveCodexOnWindows({ env, argv1 });
  try {
    return execFileSync('sh', ['-lc', 'command -v codex'], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || null;
  } catch {
    return null;
  }
}

export async function spawnCodexPty({
  codexPath,
  args = [],
  cols,
  rows,
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform
} = {}) {
  const imported = await import('@homebridge/node-pty-prebuilt-multiarch');
  const pty = imported.default ?? imported;
  const options = {
    name: env.TERM || process.env.TERM || 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...env, TERM: env.TERM || process.env.TERM || 'xterm-256color' }
  };

  if (platform === 'win32' && /\.(cmd|bat)$/i.test(codexPath)) {
    const comspec = env.ComSpec || process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const command = [quoteWindowsCmdArg(codexPath), ...args.map(quoteWindowsCmdArg)].join(' ');
    return pty.spawn(comspec, ['/d', '/s', '/c', command], options);
  }

  return pty.spawn(codexPath, args, options);
}
