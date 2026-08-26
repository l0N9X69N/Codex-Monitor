import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionManagerCore } from '../../src/manager/session-core.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p9-perf-'));
}

test('repeat discovery keeps known cold history path-only instead of restatting every session', () => {
  const root = tempDir();
  for (let i = 0; i < 120; i += 1) {
    fs.writeFileSync(path.join(root, `s-${String(i).padStart(4, '0')}.jsonl`), '');
  }

  let stats = 0;
  const fsRef = {
    ...fs,
    statSync(...args) {
      stats += 1;
      return fs.statSync(...args);
    }
  };

  const core = new SessionManagerCore({ sessionsPath: root, fsRef, identityEnrichLimit: 0 });
  core.discover({ enrichIdentity: false });
  assert.equal(core.index.length, 120);
  assert.equal(stats, 120);

  stats = 0;
  core.discover({ enrichIdentity: false });
  assert.equal(core.index.length, 120);
  assert.equal(stats, 0, 'known cold history must not be stat-ed again during normal discovery');

  fs.writeFileSync(path.join(root, 'new-session.jsonl'), '');
  stats = 0;
  core.discover({ enrichIdentity: false });
  assert.equal(core.index.length, 121);
  assert.equal(stats, 1, 'only newly discovered session should require metadata stat');

  fs.rmSync(root, { recursive: true, force: true });
});

test('cold summaries stay lazy while recent hot set is bounded', () => {
  const root = tempDir();
  for (let i = 0; i < 100; i += 1) {
    fs.writeFileSync(path.join(root, `s-${String(i).padStart(4, '0')}.jsonl`), '');
  }

  const core = new SessionManagerCore({ sessionsPath: root, identityEnrichLimit: 0 });
  core.discover({ enrichIdentity: false });
  assert.equal(core.summaries.cache.size, 0);

  core.bootstrapRecentSummaries(8);
  assert.equal(core.summaries.cache.size, 8, 'startup should hydrate only the recent summary window');

  core.tailSummaries({ limit: 16, ids: new Set(), bootstrapLive: true });
  assert.equal(core.summaries.cache.size, 16, 'fast refresh should keep summary work bounded to the hot window');
  assert.equal(core.summaries.has(core.index[50].id), false, 'cold history should remain metadata-only');

  fs.rmSync(root, { recursive: true, force: true });
});

test('missing project metadata renders as UNKNOWN instead of rollout filename', () => {
  const root = tempDir();
  const filePath = path.join(root, 'rollout-2026-08-26-example.jsonl');
  fs.writeFileSync(filePath, '');

  const core = new SessionManagerCore({ sessionsPath: root, identityEnrichLimit: 0 });
  core.discover({ enrichIdentity: false });
  const [row] = core.rows();
  assert.equal(row.project, 'UNKNOWN');
  assert.equal(row.name, 'rollout-2026-08-26-example');

  fs.rmSync(root, { recursive: true, force: true });
});
