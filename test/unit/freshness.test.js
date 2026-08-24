import test from 'node:test';
import assert from 'node:assert/strict';
import { FRESHNESS, freshnessFor, hasKnownValue } from '../../src/core/freshness.js';

test('zero is a known value while null/undefined are unknown', () => {
  assert.equal(hasKnownValue(0), true);
  assert.equal(hasKnownValue(false), true);
  assert.equal(hasKnownValue(null), false);
  assert.equal(hasKnownValue(undefined), false);
});

test('freshness preserves waiting/current/stale semantics', () => {
  assert.equal(freshnessFor(null, { updatedAtMs: 100, nowMs: 100 }), FRESHNESS.WAITING);
  assert.equal(freshnessFor(0, { updatedAtMs: 100, nowMs: 200, staleAfterMs: 200 }), FRESHNESS.CURRENT);
  assert.equal(freshnessFor(0, { updatedAtMs: 100, nowMs: 401, staleAfterMs: 200 }), FRESHNESS.STALE);
});
