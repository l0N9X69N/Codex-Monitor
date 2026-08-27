import { openArchiveDatabase } from '../archive/database.js';
import { kickArchiveService } from '../archive/integration.js';
import { requestArchiveServiceStop } from '../archive/service-control.js';
import { normalizeConfig } from './schema.js';

export function applyArchiveConfigSideEffects(previousConfig, nextConfig, {
  openDatabase = openArchiveDatabase,
  kickService = kickArchiveService,
  requestStop = requestArchiveServiceStop
} = {}) {
  const previous = normalizeConfig(previousConfig);
  const next = normalizeConfig(nextConfig);
  const wasEnabled = previous.archive.enabled === true;
  const isEnabled = next.archive.enabled === true;

  if (wasEnabled === isEnabled) {
    return {
      changed: false,
      transition: isEnabled ? 'on-to-on' : 'off-to-off',
      ok: true,
      bootstrap: null,
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
      const service = kickService(next);
      return {
        changed: true,
        transition: 'off-to-on',
        ok: service?.error == null,
        bootstrap,
        service,
        error: service?.error ?? null
      };
    } catch (error) {
      try { opened?.close?.(); } catch {}
      return {
        changed: true,
        transition: 'off-to-on',
        ok: false,
        bootstrap: { initialized: false, filePath: opened?.filePath ?? null },
        service: null,
        error: error?.message ?? String(error)
      };
    }
  }

  try {
    const service = requestStop();
    return {
      changed: true,
      transition: 'on-to-off',
      ok: true,
      bootstrap: null,
      service,
      error: null
    };
  } catch (error) {
    return {
      changed: true,
      transition: 'on-to-off',
      ok: false,
      bootstrap: null,
      service: null,
      error: error?.message ?? String(error)
    };
  }
}
