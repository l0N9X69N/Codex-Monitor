import { ensureArchiveService } from './service-control.js';

export function kickArchiveService(config, {
  ensureService = ensureArchiveService
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
