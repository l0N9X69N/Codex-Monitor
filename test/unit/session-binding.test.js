import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasCurrentRunEvidence, selectCurrentSession } from '../../src/core/session-binding.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.resolve(here, '../fixtures/phase1/session-candidates.json'), 'utf8'));

test('recent mtime without current-run evidence is rejected', () => {
  assert.equal(hasCurrentRunEvidence(fixture.staleMtimeOnly, { runStartedAtMs: fixture.runStartedAtMs }), false);
});

test('new current session is selected over stale historical candidates', () => {
  const selected = selectCurrentSession(
    [fixture.staleMtimeOnly, fixture.newCurrentSession],
    { runStartedAtMs: fixture.runStartedAtMs, cwd: 'C:/repo' }
  );
  assert.equal(selected.id, 'new-current');
});

test('resumed historical session can bind only after current-run append evidence', () => {
  const selected = selectCurrentSession(
    [fixture.staleMtimeOnly, fixture.resumedCurrentSession],
    { runStartedAtMs: fixture.runStartedAtMs, cwd: 'C:/repo' }
  );
  assert.equal(selected.id, 'resumed-current');
});
