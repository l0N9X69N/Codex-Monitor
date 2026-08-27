import { getArchiveServiceStatus } from '../archive/service-control.js';

export const DEFAULT_MANAGER_SERVICE_STATUS_INTERVAL_MS = 2500;

function timestamp(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function normalizeStatus(status, healthInstanceId, checkedAtMs) {
  const running = status?.running === true;
  const owner = status?.owner ?? null;
  const ownerInstanceId = owner?.instanceId ? String(owner.instanceId) : null;
  const metadataInstanceId = healthInstanceId ? String(healthInstanceId) : null;
  const staleLock = Boolean(owner && !running);
  const metadataStale = Boolean(metadataInstanceId && (
    !running || (ownerInstanceId && ownerInstanceId !== metadataInstanceId)
  ));
  const ownerMismatch = Boolean(
    running
    && metadataInstanceId
    && ownerInstanceId
    && ownerInstanceId !== metadataInstanceId
  );

  return {
    checked: true,
    checkedAtMs: timestamp(checkedAtMs, null),
    running,
    ownerInstanceId,
    ownerPid: Number.isSafeInteger(Number(owner?.pid)) ? Number(owner.pid) : null,
    ownerStartedAt: timestamp(owner?.startedAt, null),
    metadataInstanceId,
    staleLock,
    metadataStale,
    ownerMismatch,
    stale: staleLock || metadataStale || ownerMismatch,
    error: null
  };
}

export class ManagerArchiveServiceHealth {
  constructor({
    readStatus = getArchiveServiceStatus,
    intervalMs = DEFAULT_MANAGER_SERVICE_STATUS_INTERVAL_MS
  } = {}) {
    this.readStatus = typeof readStatus === 'function' ? readStatus : null;
    this.intervalMs = Math.max(500, Number(intervalMs) || DEFAULT_MANAGER_SERVICE_STATUS_INTERVAL_MS);
    this.lastCheckedAtMs = Number.NEGATIVE_INFINITY;
    this.last = {
      checked: false,
      checkedAtMs: null,
      running: false,
      ownerInstanceId: null,
      ownerPid: null,
      ownerStartedAt: null,
      metadataInstanceId: null,
      staleLock: false,
      metadataStale: false,
      ownerMismatch: false,
      stale: false,
      error: null
    };
  }

  async refresh(nowMs, healthInstanceId = null, { force = false } = {}) {
    const atMs = timestamp(nowMs, Date.now());
    const metadataInstanceId = healthInstanceId ? String(healthInstanceId) : null;
    const metadataChanged = this.last.metadataInstanceId !== metadataInstanceId;
    if (!force && !metadataChanged && atMs - this.lastCheckedAtMs < this.intervalMs) {
      return { changed: false, status: this.last };
    }

    this.lastCheckedAtMs = atMs;
    const before = JSON.stringify(this.last);
    if (!this.readStatus) {
      this.last = {
        ...this.last,
        checked: false,
        checkedAtMs: atMs,
        metadataInstanceId,
        error: null
      };
      return { changed: JSON.stringify(this.last) !== before, status: this.last };
    }

    try {
      const status = await this.readStatus();
      this.last = normalizeStatus(status, metadataInstanceId, atMs);
    } catch (error) {
      this.last = {
        ...this.last,
        checked: true,
        checkedAtMs: atMs,
        metadataInstanceId,
        error: error?.message ?? String(error)
      };
    }
    return { changed: JSON.stringify(this.last) !== before, status: this.last };
  }

  snapshot(healthInstanceId = null) {
    const metadataInstanceId = healthInstanceId ? String(healthInstanceId) : null;
    if (this.last.metadataInstanceId === metadataInstanceId) return { ...this.last };
    const running = this.last.running === true;
    const ownerInstanceId = this.last.ownerInstanceId ?? null;
    const metadataStale = Boolean(metadataInstanceId && (
      !running || (ownerInstanceId && ownerInstanceId !== metadataInstanceId)
    ));
    const ownerMismatch = Boolean(running && metadataInstanceId && ownerInstanceId && ownerInstanceId !== metadataInstanceId);
    return {
      ...this.last,
      metadataInstanceId,
      metadataStale,
      ownerMismatch,
      stale: Boolean(this.last.staleLock || metadataStale || ownerMismatch)
    };
  }
}

export { normalizeStatus as normalizeManagerArchiveServiceStatus };
