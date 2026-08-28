import { inspectArchiveHooks, installArchiveHooks } from './hook-config.js';
import { ensureArchiveService } from './service-control.js';

export function kickArchiveService(config, {
  ensureService = ensureArchiveService,
  inspectHooks = inspectArchiveHooks,
  installHooks = installArchiveHooks
} = {}) {
  if (config?.archive?.enabled !== true) {
    return {
      attempted: false,
      started: false,
      running: false,
      reason: 'archive-disabled',
      error: null
    };
  }

  // The hook is the wake-up edge for prompt/session lifecycle events. Repair a
  // missing or partial Monitor-owned handler before waking the SQLite service,
  // but never modify an already complete hook on every launch. Codex hook
  // trust remains Codex-owned and is intentionally not bypassed here.
  try {
    const hooks = inspectHooks();
    if (hooks?.complete !== true) installHooks();
  } catch {
    // Service wake remains fail-soft even when hooks.json needs manual repair.
    // `codexm --doctor` / `codexm --repair` expose the integration problem.
  }

  try {
    const result = ensureService({ config }) ?? {};
    return {
      attempted: true,
      error: null,
      ...result
    };
  } catch (error) {
    return {
      attempted: true,
      started: false,
      running: false,
      reason: 'service-control-failed',
      error: error?.message ?? String(error)
    };
  }
}
