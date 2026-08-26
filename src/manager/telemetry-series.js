import {
  buildSessionDashboardModel,
  rowTokenActivity,
  rowToolActivity
} from './dashboard-model.js';

function finiteOrNull(value) {
  if (value === null || value === undefined) return null;
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

function rowAgentSpawns(row) {
  const exact = finiteOrNull(row?.agentSpawnCount);
  return exact ?? finiteOrNull(row?.observedAgentSpawnCount) ?? 0;
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
    toolById: metricMap(active, rowToolActivity),
    turnCompletedById: metricMap(active, (row) => row?.lastTurnCompletedAtMs)
  };
}

function deltaForId(previous, next, id) {
  const before = previous.get(id);
  const after = next.get(id);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  if (after < before) return null;
  return after - before;
}

function rateFromDelta(delta, elapsedMs) {
  if (!Number.isFinite(delta) || elapsedMs <= 0) return null;
  return delta * (60_000 / elapsedMs);
}

function sumKnown(values) {
  const known = values.filter((value) => Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function averageKnown(values) {
  const known = values.filter((value) => Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

function rollingSum(samples, key) {
  return sumKnown(samples.map((sample) => finiteOrNull(sample?.[key]))) ?? 0;
}

function recentTurnaround(samples) {
  const values = samples.map((sample) => finiteOrNull(sample?.turnaroundMs)).filter(Number.isFinite);
  return values.length ? values.at(-1) : null;
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
      active.forEach((row) => this.pushSession(row, {
        atMs: nowMs,
        tokenDelta: null,
        tokenRate: null,
        toolEvents: null,
        turnaroundMs: null
      }));
      this.pushAggregate({
        atMs: nowMs,
        tokenDelta: null,
        tokenRate: null,
        toolEvents: null,
        turnaroundMs: null,
        activeCount: active.length
      });
      return this.snapshot();
    }

    const elapsedMs = nowMs - this.previous.atMs;
    if (elapsedMs <= 0) return this.snapshot();

    this.markActive(active);
    const sessionPoints = active.map((row) => {
      const tokenDelta = deltaForId(this.previous.tokenById, nextBaseline.tokenById, row.id);
      const toolEvents = deltaForId(this.previous.toolById, nextBaseline.toolById, row.id);
      const previousCompleted = this.previous.turnCompletedById.get(row.id);
      const nextCompleted = nextBaseline.turnCompletedById.get(row.id);
      const completedNow = Number.isFinite(nextCompleted)
        && (!Number.isFinite(previousCompleted) || nextCompleted > previousCompleted);
      const turnaroundMs = completedNow ? finiteOrNull(row?.lastTurnDurationMs) : null;
      return this.pushSession(row, {
        atMs: nowMs,
        tokenDelta,
        tokenRate: rateFromDelta(tokenDelta, elapsedMs),
        toolEvents,
        turnaroundMs
      });
    });

    this.previous = nextBaseline;
    this.pushAggregate({
      atMs: nowMs,
      tokenDelta: sumKnown(sessionPoints.map((point) => point.tokenDelta)),
      tokenRate: sumKnown(sessionPoints.map((point) => point.tokenRate)),
      toolEvents: sumKnown(sessionPoints.map((point) => point.toolEvents)),
      turnaroundMs: averageKnown(sessionPoints.map((point) => point.turnaroundMs)),
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
        context: row?.tokens?.contextUsed != null && row?.tokens?.contextWindow
          ? Math.max(0, Math.min(100, (Number(row.tokens.contextUsed) / Number(row.tokens.contextWindow)) * 100))
          : null,
        agentSpawns: rowAgentSpawns(row),
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
    const totalBurn60 = rollingSum(samples, 'tokenDelta');
    const totalTools60 = rollingSum(samples, 'toolEvents');
    const turnarounds = samples.map((sample) => finiteOrNull(sample.turnaroundMs)).filter(Number.isFinite);
    const sessions = [...this.sessionMeta.values()]
      .filter((meta) => meta.active)
      .map((meta) => {
        const sessionSamples = (this.sessionSamples.get(meta.id) ?? []).map((sample) => ({ ...sample }));
        const burn60 = rollingSum(sessionSamples, 'tokenDelta');
        const sessionTurnarounds = sessionSamples.map((sample) => finiteOrNull(sample.turnaroundMs)).filter(Number.isFinite);
        return {
          ...meta,
          burn60,
          burnShare: totalBurn60 > 0 ? (burn60 / totalBurn60) * 100 : 0,
          tools60: rollingSum(sessionSamples, 'toolEvents'),
          turnaroundMs: recentTurnaround(sessionSamples),
          avgTurnaround60Ms: averageKnown(sessionTurnarounds),
          samples: sessionSamples,
          latest: sessionSamples.at(-1) ?? null
        };
      })
      .sort((a, b) => b.burn60 - a.burn60 || String(a.project).localeCompare(String(b.project)));

    return {
      windowMs: this.windowMs,
      sampleCount: samples.length,
      samples,
      latest: samples.at(-1) ?? null,
      burn60: totalBurn60,
      tools60: totalTools60,
      turnaroundMs: recentTurnaround(samples),
      avgTurnaround60Ms: averageKnown(turnarounds),
      sessions
    };
  }
}
