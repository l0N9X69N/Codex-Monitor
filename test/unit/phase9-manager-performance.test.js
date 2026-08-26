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

test('deep selection preserves known identity when selected history lacks identity fields', () => {
  const root = tempDir();
  const filePath = path.join(root, 'selected.jsonl');
  fs.writeFileSync(filePath, [
    JSON.stringify({ type: 'event_msg', timestamp: '2026-08-26T14:00:00.000Z', payload: { type: 'turn_started', turn_id: 't1' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-08-26T14:00:05.000Z', payload: { type: 'turn_complete', turn_id: 't1' } })
  ].join('\n') + '\n');

  const core = new SessionManagerCore({ sessionsPath: root, identityEnrichLimit: 0 });
  core.discover({ enrichIdentity: false });
  const meta = core.index[0];
  meta.threadId = 'known-thread';
  meta.cwd = 'F:/LOCAL_APP/Codex Monitor';
  meta.project = 'Codex Monitor';
  meta.model = 'gpt-5.6-luna';
  meta.startedAtMs = Date.parse('2026-08-26T13:00:00.000Z');

  const model = core.select(meta.id);
  assert.equal(model.info.model, null, 'fixture intentionally lacks deep model identity');
  assert.equal(meta.model, 'gpt-5.6-luna');
  assert.equal(meta.threadId, 'known-thread');
  assert.equal(meta.cwd, 'F:/LOCAL_APP/Codex Monitor');
  assert.equal(meta.project, 'Codex Monitor');

  const detail = core.selectedDetail();
  assert.equal(detail.info.model, 'gpt-5.6-luna');
  assert.equal(detail.info.threadId, 'known-thread');
  assert.equal(detail.info.cwd, 'F:/LOCAL_APP/Codex Monitor');
  assert.equal(detail.info.project, 'Codex Monitor');

  fs.rmSync(root, { recursive: true, force: true });
});
