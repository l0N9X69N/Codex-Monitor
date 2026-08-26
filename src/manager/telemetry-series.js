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

function sumMetric(rows, metric) {
  let known = false;
  let total = 0;
  for (const row of rows) {
    const value = finiteOrNull(metric(row));
    if (value == null) continue;
    known = true;
    total += value;
  }
  return known ? total : null;
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

function identityKey(model) {
  return `${model.query.scope}\u0000${model.query.search}\u0000${model.rows.map((row) => row.id).sort().join('\u0001')}`;
}

function baselineFor(model, atMs) {
  return {
    key: identityKey(model),
    atMs,
    tokenTotal: sumMetric(model.rows, rowTokenActivity),
    toolTotal: sumMetric(model.rows, rowToolActivity)
  };
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
    const nextBaseline = baselineFor(model, nowMs);
    const contextPeak = maxMetric(model.rows, rowContextPercent);

    if (!this.previous || this.previous.key !== nextBaseline.key) {
      this.samples = [];
      this.previous = nextBaseline;
      this.push({ atMs: nowMs, tokenRate: null, contextPeak, toolRate: null });
      return this.snapshot();
    }

    const elapsedMs = nowMs - this.previous.atMs;
    if (elapsedMs <= 0) return this.snapshot();

    const tokenRate = this.previous.tokenTotal != null && nextBaseline.tokenTotal != null
      ? Math.max(0, (nextBaseline.tokenTotal - this.previous.tokenTotal) * (60_000 / elapsedMs))
      : null;
    const toolRate = this.previous.toolTotal != null && nextBaseline.toolTotal != null
      ? Math.max(0, (nextBaseline.toolTotal - this.previous.toolTotal) * (60_000 / elapsedMs))
      : null;

    this.previous = nextBaseline;
    this.push({ atMs: nowMs, tokenRate, contextPeak, toolRate });
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
