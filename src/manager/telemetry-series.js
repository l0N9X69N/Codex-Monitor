import {
  buildSessionDashboardModel,
  rowContextPercent,
  rowTokenActivity,
  rowToolActivity
} from './dashboard-model.js';

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function visibleModel(rows, { scope = 'all', search = '' } = {}) {
  return buildSessionDashboardModel(rows, {
    scope,
    search,
    sortBy: 'lastActivity',
    direction: 'desc'
  });
}

function liveRows(model) {
  return model.rows.filter((row) => row?.state === 'LIVE');
}

function metricMap(rows, metric) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.id) continue;
    const value = finiteOrNull(metric(row));
    if (value != null) map.set(row.id, value);
  }
  return map;
}

function baselineFor(model, atMs) {
  const active = liveRows(model);
  return {
    key: `${model.query.scope}\u0000${model.query.search}`,
    atMs,
    tokenById: metricMap(active, rowTokenActivity),
    toolById: metricMap(active, rowToolActivity)
  };
}

function rateForId(previous, next, id, elapsedMs) {
  const before = previous.get(id);
  const after = next.get(id);
  if (!Number.isFinite(before) || !Number.isFinite(after) || elapsedMs <= 0) return null;
  if (after < before) return null;
  return (after - before) * (60_000 / elapsedMs);
}

function sumKnown(values) {
  const known = values.filter((value) => Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export class ManagerTelemetrySeries {
  constructor({ windowMs = 60_000, maxSamples = 60 } = {}) {
    this.windowMs = Math.max(1_000, Number(windowMs) || 60_000);
    this.maxSamples = Math.max(2, Number(maxSamples) || 60);
    this.samples = [];
    this.previous = null;
    this.sessionSamples = new Map();
    this.sessionMeta = new Map();
  }

  reset() {
    this.samples = [];
    this.previous = null;
    this.sessionSamples.clear();
    this.sessionMeta.clear();
  }

  rebaseline(rows = [], { scope = 'all', search = '', atMs = Date.now() } = {}) {
    const model = visibleModel(rows, { scope, search });
    this.previous = baselineFor(model, Number(atMs) || 0);
    this.markActive(liveRows(model));
    return this.snapshot();
  }

  sample(rows = [], { scope = 'all', search = '', atMs = Date.now() } = {}) {
    const nowMs = Number(atMs) || 0;
    const model = visibleModel(rows, { scope, search });
    const active = liveRows(model);
    const nextBaseline = baselineFor(model, nowMs);

    if (!this.previous || this.previous.key !== nextBaseline.key) {
      this.samples = [];
      this.sessionSamples.clear();
      this.sessionMeta.clear();
      this.previous = nextBaseline;
      this.markActive(active);
      const sessionPoints = active.map((row) => this.pushSession(row, {
        atMs: nowMs,
        tokenRate: null,
        context: finiteOrNull(rowContextPercent(row)),
        toolRate: null
      }));
      this.pushAggregate({
        atMs: nowMs,
        tokenRate: null,
        contextPeak: this.contextPeak(sessionPoints),
        toolRate: null,
        activeCount: active.length
      });
      return this.snapshot();
    }

    const elapsedMs = nowMs - this.previous.atMs;
    if (elapsedMs <= 0) return this.snapshot();

    this.markActive(active);
    const sessionPoints = active.map((row) => {
      const tokenRate = rateForId(this.previous.tokenById, nextBaseline.tokenById, row.id, elapsedMs);
      const toolRate = rateForId(this.previous.toolById, nextBaseline.toolById, row.id, elapsedMs);
      return this.pushSession(row, {
        atMs: nowMs,
        tokenRate,
        context: finiteOrNull(rowContextPercent(row)),
        toolRate
      });
    });

    this.previous = nextBaseline;
    this.pushAggregate({
      atMs: nowMs,
      tokenRate: sumKnown(sessionPoints.map((point) => point.tokenRate)),
      contextPeak: this.contextPeak(sessionPoints),
      toolRate: sumKnown(sessionPoints.map((point) => point.toolRate)),
      activeCount: active.length
    });
    this.prune(nowMs);
    return this.snapshot();
  }

  markActive(rows) {
    const activeIds = new Set(rows.map((row) => row?.id).filter(Boolean));
    for (const meta of this.sessionMeta.values()) meta.active = activeIds.has(meta.id);
    for (const row of rows) {
      if (!row?.id) continue;
      const previous = this.sessionMeta.get(row.id) ?? {};
      this.sessionMeta.set(row.id, {
        ...previous,
        id: row.id,
        project: row.project ?? row.name ?? 'session',
        threadId: row.threadId ?? row.name ?? row.id,
        model: row.model ?? '--',
        active: true
      });
    }
  }

  pushAggregate(sample) {
    this.samples.push(sample);
    while (this.samples.length > this.maxSamples) this.samples.shift();
  }

  pushSession(row, point) {
    const list = this.sessionSamples.get(row.id) ?? [];
    list.push(point);
    while (list.length > this.maxSamples) list.shift();
    this.sessionSamples.set(row.id, list);
    return point;
  }

  contextPeak(points) {
    const known = points.map((point) => point.context).filter((value) => Number.isFinite(value));
    return known.length ? Math.max(...known) : null;
  }

  prune(nowMs) {
    const cutoff = nowMs - this.windowMs;
    while (this.samples.length && this.samples[0].atMs < cutoff) this.samples.shift();
    for (const [id, list] of this.sessionSamples) {
      while (list.length && list[0].atMs < cutoff) list.shift();
      if (!list.length && !this.sessionMeta.get(id)?.active) {
        this.sessionSamples.delete(id);
        this.sessionMeta.delete(id);
      }
    }
  }

  snapshot() {
    const samples = this.samples.map((sample) => ({ ...sample }));
    const sessions = [...this.sessionMeta.values()]
      .filter((meta) => meta.active)
      .map((meta) => {
        const sessionSamples = (this.sessionSamples.get(meta.id) ?? []).map((sample) => ({ ...sample }));
        return {
          ...meta,
          samples: sessionSamples,
          latest: sessionSamples.at(-1) ?? null
        };
      })
      .sort((a, b) => {
        const ar = Number(a.latest?.tokenRate);
        const br = Number(b.latest?.tokenRate);
        if (Number.isFinite(ar) || Number.isFinite(br)) return (Number.isFinite(br) ? br : -1) - (Number.isFinite(ar) ? ar : -1);
        return String(a.project).localeCompare(String(b.project));
      });

    return {
      windowMs: this.windowMs,
      sampleCount: samples.length,
      samples,
      latest: samples.at(-1) ?? null,
      sessions
    };
  }
}
