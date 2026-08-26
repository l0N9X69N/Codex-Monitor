import { spawnSync } from 'node:child_process';
import { currentPlatform } from '../platform/common.js';

function quoteWindowsCmdArg(value) {
  if (value === '') return '""';
  let text = String(value).replace(/%/g, '%%');
  text = text.replace(/([&|<>^])/g, '^$1');
  if (!/[\s"&|<>^()]/.test(text)) return text;
  text = text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1');
  return `"${text}"`;
}

export const AUTH_MODES = Object.freeze({
  AUTO: 'auto',
  API: 'api',
  LOGIN: 'login',
  OTHER: 'other',
  UNKNOWN: 'unknown'
});

export function normalizeAuthOverride(value = 'auto') {
  const normalized = String(value ?? 'auto').trim().toLowerCase();
  if (![AUTH_MODES.AUTO, AUTH_MODES.API, AUTH_MODES.LOGIN].includes(normalized)) {
    throw new Error(`--auth expects auto, api, or login; received: ${value}`);
  }
  return normalized;
}

export function parseCodexLoginStatus(text = '') {
  const value = String(text).toLowerCase();
  if (/logged in using chatgpt/.test(value)) {
    return { mode: AUTH_MODES.LOGIN, source: 'codex-login-status:chatgpt' };
  }
  if (/logged in using an api key/.test(value)) {
    return { mode: AUTH_MODES.API, source: 'codex-login-status:api-key' };
  }
  if (/workload identity|access token|personal access token|amazon bedrock/.test(value)) {
    return { mode: AUTH_MODES.OTHER, source: 'codex-login-status:other' };
  }
  if (/not logged in/.test(value)) {
    return { mode: AUTH_MODES.UNKNOWN, source: 'codex-login-status:not-logged-in' };
  }
  return { mode: AUTH_MODES.UNKNOWN, source: 'codex-login-status:unrecognized' };
}

export function codexStatusSpawnPlan({
  codexPath = 'codex',
  env = process.env,
  platform = currentPlatform()
} = {}) {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(codexPath)) {
    const comspec = env.ComSpec || process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const command = [quoteWindowsCmdArg(codexPath), 'login', 'status'].join(' ');
    return { command: comspec, args: ['/d', '/s', '/c', command] };
  }
  return { command: codexPath, args: ['login', 'status'] };
}

export function runCodexLoginStatus({
  codexPath = 'codex',
  env = process.env,
  timeoutMs = 3_000,
  platform = currentPlatform()
} = {}) {
  try {
    const plan = codexStatusSpawnPlan({ codexPath, env, platform });
    const result = spawnSync(plan.command, plan.args, {
      encoding: 'utf8',
      windowsHide: true,
      env,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return {
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error ?? null
    };
  } catch (error) {
    return { ok: false, status: null, stdout: '', stderr: '', error };
  }
}

export function detectAuth({
  override = AUTH_MODES.AUTO,
  env = process.env,
  statusRunner = runCodexLoginStatus,
  codexPath = 'codex'
} = {}) {
  const normalizedOverride = normalizeAuthOverride(override);

  if (normalizedOverride === AUTH_MODES.API) {
    return { mode: AUTH_MODES.API, source: 'override', forced: true };
  }
  if (normalizedOverride === AUTH_MODES.LOGIN) {
    return { mode: AUTH_MODES.LOGIN, source: 'override', forced: true };
  }

  if (typeof env.CODEX_API_KEY === 'string' && env.CODEX_API_KEY.trim()) {
    return { mode: AUTH_MODES.API, source: 'env:CODEX_API_KEY', forced: false };
  }

  const status = statusRunner({ codexPath, env });
  if (!status?.ok && !status?.stdout && !status?.stderr) {
    return { mode: AUTH_MODES.UNKNOWN, source: 'codex-login-status:unavailable', forced: false };
  }

  return { ...parseCodexLoginStatus(`${status?.stdout ?? ''}\n${status?.stderr ?? ''}`), forced: false };
}

export function childEnvironmentForAuth(auth, env = process.env) {
  const childEnv = { ...env };
  if (auth?.forced && auth.mode === AUTH_MODES.LOGIN) {
    delete childEnv.CODEX_API_KEY;
  }
  return childEnv;
}

export function codexArgsForAuth(auth, args = []) {
  if (!auth?.forced) return [...args];
  if (auth.mode === AUTH_MODES.API) {
    return ['-c', "forced_login_method='api'", ...args];
  }
  if (auth.mode === AUTH_MODES.LOGIN) {
    return ['-c', "forced_login_method='chatgpt'", ...args];
  }
  return [...args];
}
