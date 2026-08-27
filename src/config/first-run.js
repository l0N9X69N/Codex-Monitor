import fs from 'node:fs';
import { getMonitorConfigPath, loadMonitorConfig, saveMonitorConfig } from './store.js';

/**
 * Re-arm onboarding for a genuinely fresh product install without deleting
 * preserved Monitor preferences or any Codex/Archive data.
 *
 * A missing config already implies setupComplete=false through DEFAULT_CONFIG,
 * so no file is created until the user explicitly saves onboarding.
 * Malformed/future configs are never rewritten here; normal recovery UX will
 * surface them and onboarding will still run because they are not valid.
 */
export function prepareFreshInstallOnboarding({
  filePath = getMonitorConfigPath(),
  fsRef = fs
} = {}) {
  const loaded = loadMonitorConfig({ filePath, fsRef });

  if (!loaded.exists) {
    return {
      changed: false,
      reason: 'no-existing-config',
      filePath: loaded.filePath,
      config: loaded.config
    };
  }

  if (!loaded.valid) {
    return {
      changed: false,
      reason: 'config-recovery-required',
      filePath: loaded.filePath,
      config: loaded.config
    };
  }

  if (loaded.config?.setupComplete !== true) {
    return {
      changed: false,
      reason: 'onboarding-already-pending',
      filePath: loaded.filePath,
      config: loaded.config
    };
  }

  const saved = saveMonitorConfig({ ...loaded.config, setupComplete: false }, {
    filePath: loaded.filePath,
    fsRef
  });

  return {
    changed: true,
    reason: 'fresh-install-onboarding-armed',
    filePath: saved.filePath,
    config: saved.config
  };
}
