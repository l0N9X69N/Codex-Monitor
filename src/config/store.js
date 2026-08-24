import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG, normalizeConfig } from './schema.js';

export function getMonitorConfigDir({ env = process.env, platform = process.platform } = {}) {
  if (env.CODEXM_CONFIG_HOME) return path.resolve(env.CODEXM_CONFIG_HOME);
  if (platform === 'win32') {
    const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'codex-monitor');
  }
  const xdg = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'codex-monitor');
}

export function getMonitorConfigPath(options = {}) {
  return path.join(getMonitorConfigDir(options), 'config.json');
}

export function loadMonitorConfig({ filePath = getMonitorConfigPath(), fsRef = fs } = {}) {
  try {
    const raw = fsRef.readFileSync(filePath, 'utf8');
    return { config: normalizeConfig(JSON.parse(raw)), filePath, exists: true, error: null };
  } catch (error) {
    if (error?.code === 'ENOENT') return { config: normalizeConfig(DEFAULT_CONFIG), filePath, exists: false, error: null };
    return { config: normalizeConfig(DEFAULT_CONFIG), filePath, exists: false, error };
  }
}

export function saveMonitorConfig(config, { filePath = getMonitorConfigPath(), fsRef = fs } = {}) {
  const normalized = normalizeConfig(config);
  fsRef.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fsRef.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  fsRef.renameSync(tempPath, filePath);
  return { config: normalized, filePath };
}

export function resetMonitorConfig({ filePath = getMonitorConfigPath(), fsRef = fs } = {}) {
  try { fsRef.unlinkSync(filePath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return normalizeConfig(DEFAULT_CONFIG);
}
