export const SQLITE_RETRY_DEFAULTS = Object.freeze({
  attempts: 4,
  baseDelayMs: 10,
  maxDelayMs: 80
});

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export function isRetryableSqliteError(error) {
  const code = String(error?.code ?? error?.errcode ?? '').toUpperCase();
  const message = String(error?.message ?? '').toUpperCase();
  return code.includes('SQLITE_BUSY')
    || code.includes('SQLITE_LOCKED')
    || message.includes('SQLITE_BUSY')
    || message.includes('SQLITE_LOCKED')
    || message.includes('DATABASE IS LOCKED');
}

export function blockingRetrySleep(ms) {
  const delay = Math.max(0, Math.trunc(Number(ms) || 0));
  if (delay <= 0) return;
  try {
    const signal = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(signal, 0, 0, delay);
  } catch {}
}

export function withSqliteRetry(fn, {
  attempts = SQLITE_RETRY_DEFAULTS.attempts,
  baseDelayMs = SQLITE_RETRY_DEFAULTS.baseDelayMs,
  maxDelayMs = SQLITE_RETRY_DEFAULTS.maxDelayMs,
  sleep = blockingRetrySleep
} = {}) {
  if (typeof fn !== 'function') throw new TypeError('withSqliteRetry requires a function');
  const limit = positiveInteger(attempts, SQLITE_RETRY_DEFAULTS.attempts);
  const base = positiveInteger(baseDelayMs, SQLITE_RETRY_DEFAULTS.baseDelayMs);
  const cap = positiveInteger(maxDelayMs, SQLITE_RETRY_DEFAULTS.maxDelayMs);
  let lastError = null;

  for (let attempt = 1; attempt <= limit; attempt += 1) {
    try {
      return fn(attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryableSqliteError(error) || attempt >= limit) throw error;
      const delay = Math.min(cap, base * (2 ** (attempt - 1)));
      try { sleep?.(delay, attempt, error); } catch {}
    }
  }
  throw lastError;
}

export function sqliteTransaction(db, fn, retryOptions = {}) {
  if (!db?.exec) throw new TypeError('sqliteTransaction requires a SQLite-like database');
  return withSqliteRetry(() => {
    let began = false;
    try {
      db.exec('BEGIN IMMEDIATE;');
      began = true;
      const value = fn();
      db.exec('COMMIT;');
      return value;
    } catch (error) {
      if (began) {
        try { db.exec('ROLLBACK;'); } catch {}
      }
      throw error;
    }
  }, retryOptions);
}
