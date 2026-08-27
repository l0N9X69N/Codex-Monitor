import fs from 'node:fs';
import path from 'node:path';
import { monitorConfigDir } from '../platform/common.js';
import { DEFAULT_CONFIG, migrateConfig, normalizeConfig } from './schema.js';

export function getMonitorConfigDir(options = {}) {
  return monitorConfigDir(options);
}

export function getMonitorConfigPath(options = {}) {
  return path.join(getMonitorConfigDir(options), 'config.json');
}

export function loadMonitorConfig({ filePath = getMonitorConfigPath(), fsRef = fs } = {}) {
  try {
    const raw = fsRef.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const config = migrateConfig(parsed, { existing: true });
    const sourceVersion = Number.isSafeInteger(Number(parsed?.configVersion)) ? Number(parsed.configVersion) : null;
    const needsMigration = JSON.stringify(parsed) !== JSON.stringify(config);
    return { config, filePath, exists: true, valid: true, sourceVersion, needsMigration, error: null };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        config: normalizeConfig(DEFAULT_CONFIG),
        filePath,
        exists: false,
        valid: true,
        sourceVersion: null,
        needsMigration: false,
        error: null
      };
    }
    return {
      config: normalizeConfig(DEFAULT_CONFIG),
      filePath,
      exists: true,
      valid: false,
      sourceVersion: null,
      needsMigration: false,
      error
    };
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
