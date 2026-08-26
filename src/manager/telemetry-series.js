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

function maxMetric(rows, metric) {
  let max = null;
  for (const row of rows) {
    const value = finiteOrNull(metric(row));
    if (value == null) continue;
    max = max == null ? value : Math.max(max, value);
  }
  return max;
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
    toolById: metricMap(active, rowToolActivity),
    activeCount: active.length
  };
}

function safeDelta(previous, next) {
  let total = 0;
  let compared = 0;
  for (const [id, value] of next) {
    const before = previous.get(id);
    if (!Number.isFinite(before) || !Number.isFinite(value)) continue;
    // Counter resets / newly hydrated counters are re-baselined instead of
    // being turned into a fake negative or cross-session spike.
    if (value < before) continue;
    total += value - before;
    compared += 1;
  }
  return compared ? total : null;
}

export class ManagerTelemetrySeries {
  constructor({ windowMs = 60_000, maxSamples = 60 } = {}) {
    this.windowMs = Math.max(1_000, Number(windowMs) || 60_000);
    this.maxSamples = Math.max(2, Number(maxSamples) || 60);
    this.samples = [];
    this.previous = null;
  }

  reset() {
    this.samples = [];
    this.previous = null;
  }

  rebaseline(rows = [], { scope = 'all', search = '', atMs = Date.now() } = {}) {
    const model = visibleModel(rows, { scope, search });
    this.previous = baselineFor(model, Number(atMs) || 0);
    return this.snapshot();
  }

  sample(rows = [], { scope = 'all', search = '', atMs = Date.now() } = {}) {
    const nowMs = Number(atMs) || 0;
    const model = visibleModel(rows, { scope, search });
    const active = liveRows(model);
    const nextBaseline = baselineFor(model, nowMs);
    const contextPeak = maxMetric(active, rowContextPercent);

    if (!this.previous || this.previous.key !== nextBaseline.key) {
      this.samples = [];
      this.previous = nextBaseline;
      this.push({ atMs: nowMs, tokenRate: null, contextPeak, toolRate: null, activeCount: active.length });
      return this.snapshot();
    }

    const elapsedMs = nowMs - this.previous.atMs;
    if (elapsedMs <= 0) return this.snapshot();

    const tokenDelta = safeDelta(this.previous.tokenById, nextBaseline.tokenById);
    const toolDelta = safeDelta(this.previous.toolById, nextBaseline.toolById);
    const tokenRate = tokenDelta == null ? null : tokenDelta * (60_000 / elapsedMs);
    const toolRate = toolDelta == null ? null : toolDelta * (60_000 / elapsedMs);

    this.previous = nextBaseline;
    this.push({
      atMs: nowMs,
      tokenRate,
      contextPeak,
      toolRate,
      activeCount: active.length
    });
    return this.snapshot();
  }

  push(sample) {
    this.samples.push(sample);
    const cutoff = sample.atMs - this.windowMs;
    while (this.samples.length && this.samples[0].atMs < cutoff) this.samples.shift();
    while (this.samples.length > this.maxSamples) this.samples.shift();
  }

  snapshot() {
    const samples = this.samples.map((sample) => ({ ...sample }));
    return {
      windowMs: this.windowMs,
      sampleCount: samples.length,
      samples,
      latest: samples.at(-1) ?? null
    };
  }
}
