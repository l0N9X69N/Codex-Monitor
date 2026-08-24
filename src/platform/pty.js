import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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

function resolveWindowsNpmCodexLauncher(codexPath, existsSync = fs.existsSync) {
  if (!/\.(cmd|bat)$/i.test(codexPath)) return null;
  const shimDir = path.dirname(codexPath);
  const launcher = path.join(shimDir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  return existsSync(launcher) ? launcher : null;
}

export function createCodexPtySpawnPlan({
  codexPath,
  args = [],
  env = process.env,
  platform = process.platform,
  execPath = process.execPath,
  existsSync = fs.existsSync
} = {}) {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(codexPath)) {
    const launcher = resolveWindowsNpmCodexLauncher(codexPath, existsSync);
    if (launcher) {
      const localNode = path.join(path.dirname(codexPath), 'node.exe');
      const nodePath = existsSync(localNode) ? localNode : execPath;
      return {
        kind: 'windows-npm-shim-bypass',
        file: nodePath,
        args: [launcher, ...args]
      };
    }

    const comspec = env.ComSpec || process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const command = [quoteWindowsCmdArg(codexPath), ...args.map(quoteWindowsCmdArg)].join(' ');
    return {
      kind: 'windows-cmd-fallback',
      file: comspec,
      args: ['/d', '/s', '/c', command]
    };
  }

  return { kind: 'direct', file: codexPath, args: [...args] };
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
  const plan = createCodexPtySpawnPlan({ codexPath, args, env, platform });
  return pty.spawn(plan.file, plan.args, options);
}
