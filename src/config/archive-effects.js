import { openArchiveDatabase } from '../archive/database.js';
import { installArchiveHooks, uninstallArchiveHooks } from '../archive/hook-config.js';
import { kickArchiveService } from '../archive/integration.js';
import { requestArchiveServiceStop } from '../archive/service-control.js';
import { publishManagerArchiveConfig } from '../manager/archive-config-state.js';
import { normalizeConfig } from './schema.js';

export function applyArchiveConfigSideEffects(previousConfig, nextConfig, {
  openDatabase = openArchiveDatabase,
  installHooks = installArchiveHooks,
  uninstallHooks = uninstallArchiveHooks,
  kickService = kickArchiveService,
  requestStop = requestArchiveServiceStop
} = {}) {
  const previous = normalizeConfig(previousConfig);
  const next = normalizeConfig(nextConfig);
  publishManagerArchiveConfig(next);
  const wasEnabled = previous.archive.enabled === true;
  const isEnabled = next.archive.enabled === true;

  if (wasEnabled === isEnabled) {
    return {
      changed: false,
      transition: isEnabled ? 'on-to-on' : 'off-to-off',
      ok: true,
      bootstrap: null,
      hooks: null,
      service: null,
      error: null
    };
  }

  if (!wasEnabled && isEnabled) {
    let opened = null;
    try {
      opened = openDatabase();
      const bootstrap = { initialized: true, filePath: opened.filePath ?? null };
      opened.close?.();
      opened = null;

      let hooks = null;
      try {
        hooks = installHooks();
      } catch (error) {
        hooks = { installed: false, changed: false, error: error?.message ?? String(error) };
      }

      const service = kickService(next);
      const hookError = hooks?.installed === false ? hooks?.error ?? 'archive hook installation failed' : null;
      const serviceError = service?.error ?? null;
      return {
        changed: true,
        transition: 'off-to-on',
        ok: hookError == null && serviceError == null,
        bootstrap,
        hooks,
        service,
        error: hookError ?? serviceError
      };
    } catch (error) {
      try { opened?.close?.(); } catch {}
      return {
        changed: true,
        transition: 'off-to-on',
        ok: false,
        bootstrap: { initialized: false, filePath: opened?.filePath ?? null },
        hooks: null,
        service: null,
        error: error?.message ?? String(error)
      };
    }
  }

  let hooks = null;
  let hookError = null;
  try {
    hooks = uninstallHooks();
    if (hooks?.removed === false) hookError = hooks?.error ?? 'archive hook removal failed';
  } catch (error) {
    hookError = error?.message ?? String(error);
    hooks = { removed: false, changed: false, error: hookError };
  }

  let service = null;
  let serviceError = null;
  try {
    service = requestStop();
  } catch (error) {
    serviceError = error?.message ?? String(error);
  }

  return {
    changed: true,
    transition: 'on-to-off',
    ok: hookError == null && serviceError == null,
    bootstrap: null,
    hooks,
    service,
    error: hookError ?? serviceError
  };
}
